package metrics

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests processed, partitioned by route pattern, feature, method, status code, and client mode.",
		},
		[]string{"route", "feature", "method", "status", "client_mode"},
	)

	HTTPRequestDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency distributions in seconds, partitioned by route pattern, feature, and method.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"route", "feature", "method"},
	)

	FeatureEventsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "thweb_feature_events_total",
			Help: "Total number of explicit application feature interaction events, partitioned by feature, action, and client mode.",
		},
		[]string{"feature", "action", "client_mode"},
	)

	UserActivityLastPurgeTimestamp = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "thweb_user_activity_last_purge_timestamp_seconds",
			Help: "Unix timestamp of the last successful user_activity retention purge.",
		},
	)
)

// AllowedClientFeatures defines the bounded allow-list of feature names accepted by POST /api/activity.
var AllowedClientFeatures = map[string]bool{
	"dashboard":      true,
	"meal_allergens": true,
	"families":       true,
	"hygiene":        true,
	"memberships":    true,
	"employees":      true,
	"fees":           true,
	"jobs":           true,
	"admin":          true,
	"session":        true,
}

// AllowedClientActions defines the bounded allow-list of action names accepted by POST /api/activity.
var AllowedClientActions = map[string]bool{
	"view":     true,
	"tab_open": true,
	"save":     true,
	"finalize": true,
	"calculate": true,
	"simulate": true,
	"export":   true,
}

// DeriveClientMode returns the bounded client_mode label ("kiosk", "dashboard", "portal", or "unknown").
func DeriveClientMode(r *http.Request) string {
	if r.Header.Get("X-Client-Verified") == "SUCCESS" || strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Kiosk-Mode")), "true") {
		return "kiosk"
	}
	view := strings.ToLower(strings.TrimSpace(r.Header.Get("X-App-View")))
	switch view {
	case "dashboard":
		return "dashboard"
	case "portal":
		return "portal"
	default:
		return "unknown"
	}
}

// MapRouteToFeature maps a Chi route pattern or URL path to a low-cardinality product feature label.
func MapRouteToFeature(routePattern, rawPath string) string {
	p := strings.TrimSpace(routePattern)
	if p == "" || p == "unmatched" {
		p = strings.TrimSpace(rawPath)
	}
	p = strings.TrimSuffix(p, "/")
	if p == "" {
		return "other"
	}

	switch {
	case p == "/health":
		return "health"
	case p == "/api/me" || p == "/ws" || p == "/api/ws" || p == "/api/activity":
		return "session"
	case strings.HasPrefix(p, "/api/dashboard") || p == "/api/allergies/summary":
		return "dashboard"
	case strings.HasPrefix(p, "/api/mealplan"):
		return "mealplan"
	case strings.HasPrefix(p, "/api/meal-allergens"):
		return "meal_allergens"
	case strings.HasPrefix(p, "/api/hygiene-events") || strings.HasSuffix(p, "/hygiene-events"):
		return "hygiene"
	case p == "/api/members" || strings.HasPrefix(p, "/api/memberships") || strings.HasSuffix(p, "/memberships"):
		return "memberships"
	case strings.HasPrefix(p, "/api/jobs") || strings.HasSuffix(p, "/jobs"):
		return "jobs"
	case strings.HasPrefix(p, "/api/employees"):
		return "employees"
	case strings.HasPrefix(p, "/api/fees"):
		return "fees"
	case strings.HasPrefix(p, "/api/families") ||
		strings.HasPrefix(p, "/api/parents") ||
		strings.HasPrefix(p, "/api/children"):
		return "families"
	case strings.HasPrefix(p, "/api/admin") ||
		p == "/api/roles" ||
		p == "/api/permissions" ||
		p == "/api/audit-logs" ||
		strings.HasPrefix(p, "/api/simulation"):
		return "admin"
	default:
		return "other"
	}
}

// Middleware instruments HTTP requests with Prometheus metrics while preserving http.Hijacker and http.Flusher for WebSockets.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		next.ServeHTTP(ww, r)

		duration := time.Since(start).Seconds()

		var route string
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			route = rctx.RoutePattern()
		}
		if route == "" {
			route = "unmatched"
		}

		feature := MapRouteToFeature(route, r.URL.Path)
		clientMode := DeriveClientMode(r)

		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}
		statusStr := strconv.Itoa(status)

		HTTPRequestsTotal.WithLabelValues(route, feature, r.Method, statusStr, clientMode).Inc()
		HTTPRequestDurationSeconds.WithLabelValues(route, feature, r.Method).Observe(duration)
	})
}
