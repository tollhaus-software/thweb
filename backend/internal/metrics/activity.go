package metrics

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ActivityKey uniquely identifies an hourly user-activity bucket row in thweb_monitoring.user_activity.
type ActivityKey struct {
	BucketHour        time.Time
	Host              string
	Feature           string
	ClientMode        string
	AuthMethod        string
	ForwardedEmail    string
	ForwardedUser     string
	PreferredUsername string
	ForwardedGroups   string
	ClientDN          string
	KioskMode         string
}

// ActivityRecorder buffers hourly user/feature activity counts in memory and periodically flushes them to Postgres.
type ActivityRecorder struct {
	pool   *pgxpool.Pool
	mu     sync.Mutex
	counts map[ActivityKey]int
}

// NewActivityRecorder creates a new ActivityRecorder backed by the given pgxpool.Pool (may be nil in unit tests).
func NewActivityRecorder(pool *pgxpool.Pool) *ActivityRecorder {
	return &ActivityRecorder{
		pool:   pool,
		counts: make(map[ActivityKey]int),
	}
}

// EnsureSchema checks whether the user_activity table exists and attempts to create it if missing.
func (ar *ActivityRecorder) EnsureSchema(ctx context.Context) {
	if ar == nil || ar.pool == nil {
		return
	}
	var exists int
	if err := ar.pool.QueryRow(ctx, "SELECT 1 FROM user_activity LIMIT 1").Scan(&exists); err == nil || err == pgx.ErrNoRows {
		return
	}
	_, err := ar.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS user_activity (
			bucket_hour        TIMESTAMPTZ NOT NULL,
			host               TEXT        NOT NULL,
			feature            TEXT        NOT NULL DEFAULT 'other',
			client_mode        TEXT        NOT NULL DEFAULT 'unknown',
			auth_method        TEXT        NOT NULL,
			forwarded_email    TEXT        NOT NULL DEFAULT '',
			forwarded_user     TEXT        NOT NULL DEFAULT '',
			preferred_username TEXT        NOT NULL DEFAULT '',
			forwarded_groups   TEXT        NOT NULL DEFAULT '',
			client_dn          TEXT        NOT NULL DEFAULT '',
			kiosk_mode         TEXT        NOT NULL DEFAULT '',
			request_count      INTEGER     NOT NULL DEFAULT 0,
			PRIMARY KEY (bucket_hour, host, feature, client_mode, auth_method, forwarded_email, forwarded_user, client_dn)
		);
		CREATE INDEX IF NOT EXISTS idx_user_activity_bucket_hour ON user_activity (bucket_hour DESC);
		CREATE INDEX IF NOT EXISTS idx_user_activity_host_bucket ON user_activity (host, bucket_hour DESC);
		CREATE INDEX IF NOT EXISTS idx_user_activity_feature_bucket ON user_activity (feature, bucket_hour DESC);
	`)
	if err != nil {
		log.Printf("[WARNING] ActivityRecorder failed to ensure user_activity schema: %v\n", err)
	}
}

// Record increments the counter for the given ActivityKey.
func (ar *ActivityRecorder) Record(key ActivityKey) {
	if ar == nil {
		return
	}
	if key.BucketHour.IsZero() {
		key.BucketHour = time.Now().UTC().Truncate(time.Hour)
	} else {
		key.BucketHour = key.BucketHour.UTC().Truncate(time.Hour)
	}
	if key.Host == "" {
		key.Host = "unknown"
	}
	if key.Feature == "" {
		key.Feature = "other"
	}
	if key.ClientMode == "" {
		key.ClientMode = "unknown"
	}
	if key.AuthMethod == "" {
		key.AuthMethod = "unknown"
	}

	ar.mu.Lock()
	ar.counts[key]++
	ar.mu.Unlock()
}

// RecordHTTPRequest extracts verbatim proxy/kiosk headers from an authenticated HTTP request and records activity.
func (ar *ActivityRecorder) RecordHTTPRequest(r *http.Request, authMethod string, fallbackEmail string) {
	if ar == nil || r == nil {
		return
	}
	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = strings.TrimSpace(r.Host)
	}
	if host == "" {
		host = "unknown"
	}

	var routePattern string
	if rctx := chi.RouteContext(r.Context()); rctx != nil {
		routePattern = rctx.RoutePattern()
	}
	feature := MapRouteToFeature(routePattern, r.URL.Path)
	clientMode := DeriveClientMode(r)

	ar.RecordHTTPRequestWithFeature(r, host, feature, clientMode, authMethod, fallbackEmail)
}

// RecordHTTPRequestWithFeature records an authenticated HTTP request with explicit host, feature, and clientMode.
func (ar *ActivityRecorder) RecordHTTPRequestWithFeature(r *http.Request, host, feature, clientMode, authMethod, fallbackEmail string) {
	if ar == nil || r == nil {
		return
	}
	forwardedEmail := strings.TrimSpace(r.Header.Get("X-Forwarded-Email"))
	if forwardedEmail == "null" || forwardedEmail == "undefined" {
		forwardedEmail = ""
	}
	if forwardedEmail == "" && fallbackEmail != "" {
		forwardedEmail = strings.TrimSpace(fallbackEmail)
	}

	forwardedUser := strings.TrimSpace(r.Header.Get("X-Forwarded-User"))
	preferredUsername := strings.TrimSpace(r.Header.Get("X-Forwarded-Preferred-Username"))
	forwardedGroups := strings.TrimSpace(r.Header.Get("X-Forwarded-Groups"))
	clientDN := strings.TrimSpace(r.Header.Get("X-Client-DN"))
	kioskMode := strings.TrimSpace(r.Header.Get("X-Kiosk-Mode"))

	ar.Record(ActivityKey{
		BucketHour:        time.Now().UTC().Truncate(time.Hour),
		Host:              host,
		Feature:           feature,
		ClientMode:        clientMode,
		AuthMethod:        authMethod,
		ForwardedEmail:    forwardedEmail,
		ForwardedUser:     forwardedUser,
		PreferredUsername: preferredUsername,
		ForwardedGroups:   forwardedGroups,
		ClientDN:          clientDN,
		KioskMode:         kioskMode,
	})
}

// PendingCount returns the number of distinct keys waiting to be flushed (useful for testing).
func (ar *ActivityRecorder) PendingCount() int {
	if ar == nil {
		return 0
	}
	ar.mu.Lock()
	defer ar.mu.Unlock()
	return len(ar.counts)
}

// SnapshotAndReset atomically swaps out the current counts map and returns the snapshot.
func (ar *ActivityRecorder) SnapshotAndReset() map[ActivityKey]int {
	if ar == nil {
		return nil
	}
	ar.mu.Lock()
	defer ar.mu.Unlock()
	if len(ar.counts) == 0 {
		return nil
	}
	snap := ar.counts
	ar.counts = make(map[ActivityKey]int)
	return snap
}

// Flush writes all buffered activity counts to the database using a pgx.Batch upsert.
func (ar *ActivityRecorder) Flush(ctx context.Context) error {
	if ar == nil {
		return nil
	}
	snap := ar.SnapshotAndReset()
	if len(snap) == 0 || ar.pool == nil {
		return nil
	}

	batch := &pgx.Batch{}
	const upsertSQL = `
		INSERT INTO user_activity (
			bucket_hour, host, feature, client_mode, auth_method,
			forwarded_email, forwarded_user, preferred_username, forwarded_groups,
			client_dn, kiosk_mode, request_count
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (bucket_hour, host, feature, client_mode, auth_method, forwarded_email, forwarded_user, client_dn)
		DO UPDATE SET
			request_count      = user_activity.request_count + EXCLUDED.request_count,
			preferred_username = CASE WHEN EXCLUDED.preferred_username <> '' THEN EXCLUDED.preferred_username ELSE user_activity.preferred_username END,
			forwarded_groups   = CASE WHEN EXCLUDED.forwarded_groups <> '' THEN EXCLUDED.forwarded_groups ELSE user_activity.forwarded_groups END,
			kiosk_mode         = CASE WHEN EXCLUDED.kiosk_mode <> '' THEN EXCLUDED.kiosk_mode ELSE user_activity.kiosk_mode END
	`

	for k, count := range snap {
		batch.Queue(upsertSQL,
			k.BucketHour,
			k.Host,
			k.Feature,
			k.ClientMode,
			k.AuthMethod,
			k.ForwardedEmail,
			k.ForwardedUser,
			k.PreferredUsername,
			k.ForwardedGroups,
			k.ClientDN,
			k.KioskMode,
			count,
		)
	}

	br := ar.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range snap {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

// StartFlushLoop periodically flushes buffered activity counts until ctx is cancelled, then performs a final flush.
func (ar *ActivityRecorder) StartFlushLoop(ctx context.Context, interval time.Duration) {
	if ar == nil || ar.pool == nil {
		return
	}
	if interval <= 0 {
		interval = 60 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := ar.Flush(flushCtx); err != nil {
				log.Printf("[WARNING] Final user_activity flush failed: %v\n", err)
			}
			cancel()
			return
		case <-ticker.C:
			flushCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			if err := ar.Flush(flushCtx); err != nil {
				log.Printf("[WARNING] Periodic user_activity flush failed: %v\n", err)
			}
			cancel()
		}
	}
}

// PurgeOldRecords deletes rows from user_activity older than retentionDays and updates the purge timestamp metric.
func (ar *ActivityRecorder) PurgeOldRecords(ctx context.Context, retentionDays int) error {
	if ar == nil || ar.pool == nil {
		return nil
	}
	if retentionDays <= 0 {
		retentionDays = 30
	}
	_, err := ar.pool.Exec(ctx,
		`DELETE FROM user_activity WHERE bucket_hour < NOW() - ($1 * INTERVAL '1 day')`,
		retentionDays,
	)
	if err != nil {
		return err
	}
	UserActivityLastPurgeTimestamp.SetToCurrentTime()
	return nil
}

// StartPurgeLoop runs PurgeOldRecords immediately and then every 24 hours until ctx is cancelled.
func (ar *ActivityRecorder) StartPurgeLoop(ctx context.Context, retentionDays int) {
	if ar == nil || ar.pool == nil {
		return
	}
	runPurge := func() {
		purgeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err := ar.PurgeOldRecords(purgeCtx, retentionDays); err != nil {
			log.Printf("[WARNING] user_activity retention purge failed: %v\n", err)
		}
	}

	runPurge()

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runPurge()
		}
	}
}

// SiteSummary summarizes distinct active identities and request totals per host.
type SiteSummary struct {
	Host       string `json:"host"`
	Active24h  int    `json:"active_24h"`
	Active7d   int    `json:"active_7d"`
	Active30d  int    `json:"active_30d"`
	Requests7d int    `json:"requests_7d"`
}

// FeatureSummary summarizes feature usage by client mode for a given time window.
type FeatureSummary struct {
	Host         string `json:"host"`
	Feature      string `json:"feature"`
	ClientMode   string `json:"client_mode"`
	UniqueUsers  int    `json:"unique_users"`
	RequestCount int    `json:"request_count"`
}

// UserActivityDetail provides verbatim auth and feature activity for individual identities.
type UserActivityDetail struct {
	Host              string    `json:"host"`
	AuthMethod        string    `json:"auth_method"`
	ClientMode        string    `json:"client_mode"`
	ForwardedEmail    string    `json:"forwarded_email"`
	ForwardedUser     string    `json:"forwarded_user"`
	PreferredUsername string    `json:"preferred_username"`
	ForwardedGroups   string    `json:"forwarded_groups"`
	ClientDN          string    `json:"client_dn"`
	KioskMode         string    `json:"kiosk_mode"`
	FeaturesUsed      string    `json:"features_used"`
	TotalRequests     int       `json:"total_requests"`
	LastActiveHourUTC time.Time `json:"last_active_hour_utc"`
}

// ActivityStatsResponse contains all activity aggregated data for the admin view.
type ActivityStatsResponse struct {
	Available bool                 `json:"available"`
	Days      int                  `json:"days"`
	Sites     []SiteSummary        `json:"sites"`
	Features  []FeatureSummary     `json:"features"`
	Users     []UserActivityDetail `json:"users"`
}

// GetActivityStats queries aggregated activity statistics from PostgreSQL.
func (ar *ActivityRecorder) GetActivityStats(ctx context.Context, days int, limit int) (*ActivityStatsResponse, error) {
	if days <= 0 || days > 90 {
		days = 7
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	resp := &ActivityStatsResponse{
		Available: false,
		Days:      days,
		Sites:     []SiteSummary{},
		Features:  []FeatureSummary{},
		Users:     []UserActivityDetail{},
	}

	if ar == nil || ar.pool == nil {
		return resp, nil
	}

	// Flush any pending in-memory buffer so the latest counts are present in PostgreSQL
	_ = ar.Flush(ctx)

	resp.Available = true

	// 1. Site Summary
	siteRows, err := ar.pool.Query(ctx, `
		SELECT
			host,
			COUNT(DISTINCT COALESCE(NULLIF(forwarded_email, ''), NULLIF(forwarded_user, ''), NULLIF(client_dn, ''))) FILTER (WHERE bucket_hour >= NOW() - INTERVAL '24 hours') AS active_24h,
			COUNT(DISTINCT COALESCE(NULLIF(forwarded_email, ''), NULLIF(forwarded_user, ''), NULLIF(client_dn, ''))) FILTER (WHERE bucket_hour >= NOW() - INTERVAL '7 days') AS active_7d,
			COUNT(DISTINCT COALESCE(NULLIF(forwarded_email, ''), NULLIF(forwarded_user, ''), NULLIF(client_dn, ''))) FILTER (WHERE bucket_hour >= NOW() - INTERVAL '30 days') AS active_30d,
			COALESCE(SUM(request_count) FILTER (WHERE bucket_hour >= NOW() - INTERVAL '7 days'), 0) AS requests_7d
		FROM user_activity
		GROUP BY host
		ORDER BY host
	`)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return resp, nil
		}
		return nil, err
	}
	defer siteRows.Close()

	for siteRows.Next() {
		var s SiteSummary
		if err := siteRows.Scan(&s.Host, &s.Active24h, &s.Active7d, &s.Active30d, &s.Requests7d); err != nil {
			return nil, err
		}
		resp.Sites = append(resp.Sites, s)
	}
	if err := siteRows.Err(); err != nil {
		return nil, err
	}

	// 2. Feature Summary
	featRows, err := ar.pool.Query(ctx, `
		SELECT
			host,
			feature,
			client_mode,
			COUNT(DISTINCT COALESCE(NULLIF(forwarded_email, ''), NULLIF(forwarded_user, ''), NULLIF(client_dn, ''))) AS unique_users,
			COALESCE(SUM(request_count), 0) AS request_count
		FROM user_activity
		WHERE bucket_hour >= NOW() - ($1 * INTERVAL '1 day')
		GROUP BY host, feature, client_mode
		ORDER BY host, request_count DESC
	`, days)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return resp, nil
		}
		return nil, err
	}
	defer featRows.Close()

	for featRows.Next() {
		var f FeatureSummary
		if err := featRows.Scan(&f.Host, &f.Feature, &f.ClientMode, &f.UniqueUsers, &f.RequestCount); err != nil {
			return nil, err
		}
		resp.Features = append(resp.Features, f)
	}
	if err := featRows.Err(); err != nil {
		return nil, err
	}

	// 3. User Activity Details
	userRows, err := ar.pool.Query(ctx, `
		SELECT
			host,
			auth_method,
			client_mode,
			forwarded_email,
			forwarded_user,
			preferred_username,
			forwarded_groups,
			client_dn,
			kiosk_mode,
			COALESCE(STRING_AGG(DISTINCT feature, ', ' ORDER BY feature), '') AS features_used,
			COALESCE(SUM(request_count), 0) AS total_requests,
			COALESCE(MAX(bucket_hour), NOW()) AS last_active_hour_utc
		FROM user_activity
		WHERE bucket_hour >= NOW() - ($1 * INTERVAL '1 day')
		GROUP BY host, auth_method, client_mode, forwarded_email, forwarded_user, preferred_username, forwarded_groups, client_dn, kiosk_mode
		ORDER BY last_active_hour_utc DESC, total_requests DESC
		LIMIT $2
	`, days, limit)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return resp, nil
		}
		return nil, err
	}
	defer userRows.Close()

	for userRows.Next() {
		var u UserActivityDetail
		if err := userRows.Scan(
			&u.Host,
			&u.AuthMethod,
			&u.ClientMode,
			&u.ForwardedEmail,
			&u.ForwardedUser,
			&u.PreferredUsername,
			&u.ForwardedGroups,
			&u.ClientDN,
			&u.KioskMode,
			&u.FeaturesUsed,
			&u.TotalRequests,
			&u.LastActiveHourUTC,
		); err != nil {
			return nil, err
		}
		resp.Users = append(resp.Users, u)
	}
	if err := userRows.Err(); err != nil {
		return nil, err
	}

	return resp, nil
}

// HandleInternalActivity handles mirrored activity subrequests from the internal gateway listeners (:8082, :8083).
func (ar *ActivityRecorder) HandleInternalActivity(w http.ResponseWriter, r *http.Request) {
	if ar != nil {
		email := strings.TrimSpace(r.Header.Get("X-Forwarded-Email"))
		user := strings.TrimSpace(r.Header.Get("X-Forwarded-User"))
		if email != "" || user != "" {
			host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
			if host == "" {
				host = strings.TrimSpace(r.Host)
			}
			feature := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Activity-Feature")))
			switch feature {
			case "paperless", "monitoring":
			default:
				feature = "other"
			}
			ar.RecordHTTPRequestWithFeature(r, host, feature, "web", "oauth2_proxy", "")
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleClientActivityEvent handles POST /api/activity for explicit frontend feature interactions.
func (ar *ActivityRecorder) HandleClientActivityEvent(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Feature string `json:"feature"`
		Action  string `json:"action"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&payload); err != nil {
		http.Error(w, `{"error":"invalid JSON payload"}`, http.StatusBadRequest)
		return
	}
	feature := strings.ToLower(strings.TrimSpace(payload.Feature))
	action := strings.ToLower(strings.TrimSpace(payload.Action))
	if !AllowedClientFeatures[feature] || !AllowedClientActions[action] {
		http.Error(w, `{"error":"unsupported feature or action"}`, http.StatusBadRequest)
		return
	}

	clientMode := DeriveClientMode(r)
	FeatureEventsTotal.WithLabelValues(feature, action, clientMode).Inc()

	if ar != nil {
		host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
		if host == "" {
			host = strings.TrimSpace(r.Host)
		}
		authMethod := "oauth2_proxy"
		if clientMode == "kiosk" {
			authMethod = "kiosk_mtls"
		}
		ar.RecordHTTPRequestWithFeature(r, host, feature, clientMode, authMethod, "")
	}

	w.WriteHeader(http.StatusNoContent)
}
