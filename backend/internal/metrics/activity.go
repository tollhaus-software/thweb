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
