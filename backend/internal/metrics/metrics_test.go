package metrics

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestMapRouteToFeature(t *testing.T) {
	cases := []struct {
		route string
		path  string
		want  string
	}{
		{"/health", "/health", "health"},
		{"/api/me", "/api/me", "session"},
		{"/ws", "/ws", "session"},
		{"/api/ws", "/api/ws", "session"},
		{"/api/activity", "/api/activity", "session"},
		{"/api/dashboard/daily-brief", "/api/dashboard/daily-brief", "dashboard"},
		{"/api/allergies/summary", "/api/allergies/summary", "dashboard"},
		{"/api/meal-allergens/{date}", "/api/meal-allergens/2026-11-03", "meal_allergens"},
		{"/api/families/{id}", "/api/families/123", "families"},
		{"/api/children/{id}", "/api/children/123", "families"},
		{"/api/parents/{id}/hygiene-events", "/api/parents/123/hygiene-events", "hygiene"},
		{"/api/hygiene-events/{id}", "/api/hygiene-events/123", "hygiene"},
		{"/api/members", "/api/members", "memberships"},
		{"/api/parents/{id}/memberships", "/api/parents/123/memberships", "memberships"},
		{"/api/employees/{id}", "/api/employees/123", "employees"},
		{"/api/employees/{id}/jobs", "/api/employees/123/jobs", "jobs"},
		{"/api/parents/{id}/jobs", "/api/parents/123/jobs", "jobs"},
		{"/api/jobs/{id}/assignees", "/api/jobs/123/assignees", "jobs"},
		{"/api/fees/calculate", "/api/fees/calculate", "fees"},
		{"/api/admin/users", "/api/admin/users", "admin"},
		{"/api/audit-logs", "/api/audit-logs", "admin"},
		{"/api/simulation", "/api/simulation", "admin"},
		{"unmatched", "/random/404", "other"},
	}

	for _, tc := range cases {
		got := MapRouteToFeature(tc.route, tc.path)
		if got != tc.want {
			t.Errorf("MapRouteToFeature(%q, %q) = %q, want %q", tc.route, tc.path, got, tc.want)
		}
	}
}

func TestDeriveClientMode(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/daily-brief", nil)
	if got := DeriveClientMode(req); got != "unknown" {
		t.Fatalf("expected unknown, got %q", got)
	}

	req.Header.Set("X-App-View", "portal")
	if got := DeriveClientMode(req); got != "portal" {
		t.Fatalf("expected portal, got %q", got)
	}

	req.Header.Set("X-App-View", "Dashboard")
	if got := DeriveClientMode(req); got != "dashboard" {
		t.Fatalf("expected dashboard, got %q", got)
	}

	// Kiosk headers take precedence over X-App-View
	req.Header.Set("X-Kiosk-Mode", "true")
	if got := DeriveClientMode(req); got != "kiosk" {
		t.Fatalf("expected kiosk, got %q", got)
	}
}

func TestMiddlewareAndActivityRecorder(t *testing.T) {
	r := chi.NewRouter()
	r.Use(Middleware)
	r.Get("/api/families/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	before := testutil.ToFloat64(HTTPRequestsTotal.WithLabelValues("/api/families/{id}", "families", "GET", "200", "portal"))

	req := httptest.NewRequest(http.MethodGet, "/api/families/abc-123", nil)
	req.Header.Set("X-App-View", "portal")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	after := testutil.ToFloat64(HTTPRequestsTotal.WithLabelValues("/api/families/{id}", "families", "GET", "200", "portal"))
	if after != before+1 {
		t.Fatalf("expected counter to increment by 1, before=%v after=%v", before, after)
	}

	// Unmatched 404 route should normalize to "unmatched"
	before404 := testutil.ToFloat64(HTTPRequestsTotal.WithLabelValues("unmatched", "other", "GET", "404", "unknown"))
	req404 := httptest.NewRequest(http.MethodGet, "/does-not-exist", nil)
	rec404 := httptest.NewRecorder()
	r.ServeHTTP(rec404, req404)
	after404 := testutil.ToFloat64(HTTPRequestsTotal.WithLabelValues("unmatched", "other", "GET", "404", "unknown"))
	if after404 != before404+1 {
		t.Fatalf("expected 404 unmatched counter to increment by 1, before=%v after=%v", before404, after404)
	}
}

func TestActivityRecorderAndHandlers(t *testing.T) {
	ar := NewActivityRecorder(nil)

	// 1. Test internal mirrored activity from docs-dev (paperless)
	reqMirror := httptest.NewRequest(http.MethodPost, "/internal/activity", nil)
	reqMirror.Header.Set("X-Forwarded-Host", "docs-dev.tollhaus.online")
	reqMirror.Header.Set("X-Activity-Feature", "paperless")
	reqMirror.Header.Set("X-Forwarded-Email", "alice@tollhaus-stuttgart.de")
	reqMirror.Header.Set("X-Forwarded-User", "google-sub-123")
	recMirror := httptest.NewRecorder()
	ar.HandleInternalActivity(recMirror, reqMirror)
	if recMirror.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", recMirror.Code)
	}
	// Duplicate request in the same hour should aggregate into the same key
	ar.HandleInternalActivity(httptest.NewRecorder(), reqMirror)
	if ar.PendingCount() != 1 {
		t.Fatalf("expected 1 distinct key in buffer, got %d", ar.PendingCount())
	}

	snap := ar.SnapshotAndReset()
	for k, count := range snap {
		if k.Host != "docs-dev.tollhaus.online" || k.Feature != "paperless" || k.ClientMode != "web" || k.ForwardedEmail != "alice@tollhaus-stuttgart.de" || count != 2 {
			t.Fatalf("unexpected activity record: key=%+v count=%d", k, count)
		}
	}

	// 2. Test client activity endpoint allow-list validation
	validBody := bytes.NewBufferString(`{"feature":"fees","action":"calculate"}`)
	reqClient := httptest.NewRequest(http.MethodPost, "/api/activity", validBody)
	reqClient.Header.Set("X-App-View", "portal")
	reqClient.Header.Set("X-Forwarded-Email", "parent@example.com")
	recClient := httptest.NewRecorder()
	ar.HandleClientActivityEvent(recClient, reqClient)
	if recClient.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for valid client event, got %d", recClient.Code)
	}

	invalidBody := bytes.NewBufferString(`{"feature":"arbitrary_card_explosion","action":"view"}`)
	reqInvalid := httptest.NewRequest(http.MethodPost, "/api/activity", invalidBody)
	recInvalid := httptest.NewRecorder()
	ar.HandleClientActivityEvent(recInvalid, reqInvalid)
	if recInvalid.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid client feature, got %d", recInvalid.Code)
	}

	// 3. Test GetActivityStats with nil pool returns Available: false gracefully
	stats, err := ar.GetActivityStats(context.Background(), 7, 200)
	if err != nil {
		t.Fatalf("unexpected error for GetActivityStats: %v", err)
	}
	if stats.Available {
		t.Fatalf("expected Available: false when pool is nil")
	}
	if len(stats.Sites) != 0 || len(stats.Features) != 0 || len(stats.Users) != 0 {
		t.Fatalf("expected empty slices for unconfigured activity stats")
	}

	// Also test with nil receiver
	var nilAR *ActivityRecorder
	nilStats, err := nilAR.GetActivityStats(context.Background(), 7, 200)
	if err != nil {
		t.Fatalf("unexpected error for nil receiver: %v", err)
	}
	if nilStats.Available {
		t.Fatalf("expected Available: false for nil receiver")
	}
}
