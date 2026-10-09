package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

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


