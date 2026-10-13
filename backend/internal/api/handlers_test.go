package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/kioskcert"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestHandleListAuditLogs_Permission(t *testing.T) {
	s := &Server{}

	tests := []struct {
		name       string
		user       *models.UserWithPermissions
		wantStatus int
	}{
		{
			name:       "no user context",
			user:       nil,
			wantStatus: http.StatusForbidden,
		},
		{
			name: "user without audit.all.read",
			user: &models.UserWithPermissions{
				Email:                "developer@example.com",
				EffectivePermissions: []string{"families.all.read", "children.all.write"},
			},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/audit-logs", nil)
			if tt.user != nil {
				ctx := context.WithValue(req.Context(), auth.UserContextKey, tt.user)
				req = req.WithContext(ctx)
			}
			rec := httptest.NewRecorder()

			s.HandleListAuditLogs(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("HandleListAuditLogs status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestHandleGetDailyBrief_InvalidDate(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest("GET", "/api/dashboard/daily-brief?date=invalid-date", nil)
	rec := httptest.NewRecorder()

	s.HandleGetDailyBrief(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("HandleGetDailyBrief with invalid date got status %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleGetKioskCertStatus_NoCA(t *testing.T) {
	s := &Server{
		KioskGenerator: nil,
	}
	req := httptest.NewRequest("GET", "/api/admin/kiosk-certs/status", nil)
	rec := httptest.NewRecorder()

	s.HandleGetKioskCertStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), `"ca_initialized":false`) {
		t.Errorf("expected ca_initialized: false, got: %s", rec.Body.String())
	}
}

func TestHandleIssueKioskCert_NoCA(t *testing.T) {
	s := &Server{
		KioskGenerator: nil,
	}
	req := httptest.NewRequest("POST", "/api/admin/kiosk-certs", strings.NewReader(`{"device_name":"tablet-1"}`))
	rec := httptest.NewRecorder()

	s.HandleIssueKioskCert(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

func TestHandleIssueKioskCert_MissingDeviceName(t *testing.T) {
	tmpDir := t.TempDir()
	caCertPath := filepath.Join(tmpDir, "kiosk-ca.crt")
	caKeyPath := filepath.Join(tmpDir, "kiosk-ca.key")
	_ = os.WriteFile(caCertPath, []byte("fake"), 0644)
	_ = os.WriteFile(caKeyPath, []byte("fake"), 0600)

	s := &Server{
		KioskGenerator: &kioskcert.Generator{
			CaCertPath: caCertPath,
			CaKeyPath:  caKeyPath,
		},
	}
	req := httptest.NewRequest("POST", "/api/admin/kiosk-certs", strings.NewReader(`{"device_name":""}`))
	rec := httptest.NewRecorder()

	s.HandleIssueKioskCert(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleUpdateTHMembership_Validation(t *testing.T) {
	s := &Server{}
	user := &models.UserWithPermissions{
		ID:    [16]byte{1},
		Email: "admin@example.com",
	}

	tests := []struct {
		name       string
		url        string
		body       string
		wantStatus int
	}{
		{
			name:       "invalid membership ID",
			url:        "/api/memberships/invalid-uuid",
			body:       `{"start_date":"2026-01-01","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid JSON",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `invalid-json`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid start_date format",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"not-a-date","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid end_date format",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"2026-01-01","end_date":"not-a-date","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "end_date equal to start_date",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"2026-01-01","end_date":"2026-01-01","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "end_date earlier than start_date",
			url:        "/api/memberships/11111111-1111-1111-1111-111111111111",
			body:       `{"start_date":"2026-01-05","end_date":"2026-01-04","membership_type":"full_member"}`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("PUT", tt.url, strings.NewReader(tt.body))
			ctx := context.WithValue(req.Context(), auth.UserContextKey, user)
			req = req.WithContext(ctx)

			// chi URL param mock if needed
			rCtx := chi.NewRouteContext()
			parts := strings.Split(tt.url, "/")
			if len(parts) > 3 {
				rCtx.URLParams.Add("id", parts[3])
			}
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rCtx))

			rec := httptest.NewRecorder()
			s.HandleUpdateTHMembership(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("%s status = %d, want %d", tt.name, rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestHandleTestReset_ForbiddenWithoutMockAuth(t *testing.T) {
	s := &Server{
		Authenticator: &auth.Authenticator{
			AllowMockAuth: false,
		},
	}
	req := httptest.NewRequest("POST", "/api/test/reset", nil)
	rec := httptest.NewRecorder()
	s.HandleTestReset(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("HandleTestReset without mock auth got %d, want %d", rec.Code, http.StatusForbidden)
	}
}



