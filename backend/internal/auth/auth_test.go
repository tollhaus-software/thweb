package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestRequirePermission_VaccinationStatusManage(t *testing.T) {
	middleware := RequirePermission("vaccination.status.manage")
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	handler := middleware(nextHandler)

	tests := []struct {
		name       string
		user       *models.UserWithPermissions
		wantStatus int
	}{
		{
			name: "allowed with explicit permission",
			user: &models.UserWithPermissions{
				Email:                "mga@example.com",
				EffectivePermissions: []string{"families.all.read", "vaccination.status.manage"},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "allowed with admin wildcard",
			user: &models.UserWithPermissions{
				Email:                "admin@example.com",
				EffectivePermissions: []string{"*"},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "forbidden without permission",
			user: &models.UserWithPermissions{
				Email:                "caregiver@example.com",
				EffectivePermissions: []string{"families.all.read", "children.all.write"},
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "forbidden without user context",
			user:       nil,
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			if tt.user != nil {
				ctx := context.WithValue(req.Context(), UserContextKey, tt.user)
				req = req.WithContext(ctx)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("RequirePermission status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestRequirePermission_AuditAllRead(t *testing.T) {
	middleware := RequirePermission("audit.all.read")
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	handler := middleware(nextHandler)

	tests := []struct {
		name       string
		user       *models.UserWithPermissions
		wantStatus int
	}{
		{
			name: "allowed with explicit audit.all.read permission",
			user: &models.UserWithPermissions{
				Email:                "auditor@example.com",
				EffectivePermissions: []string{"audit.all.read"},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "allowed with admin wildcard",
			user: &models.UserWithPermissions{
				Email:                "admin@example.com",
				EffectivePermissions: []string{"*"},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "forbidden without audit.all.read permission",
			user: &models.UserWithPermissions{
				Email:                "developer@example.com",
				EffectivePermissions: []string{"families.all.read", "children.all.write"},
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "forbidden without user context",
			user:       nil,
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/audit-logs", nil)
			if tt.user != nil {
				ctx := context.WithValue(req.Context(), UserContextKey, tt.user)
				req = req.WithContext(ctx)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("RequirePermission status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestExtractKmsAccessToken(t *testing.T) {
	tests := []struct {
		name       string
		headers    map[string]string
		wantToken  string
	}{
		{
			name:      "no KMS header",
			headers:   map[string]string{},
			wantToken: "",
		},
		{
			name: "oauth2-proxy forwarded token must not be used as KMS token",
			headers: map[string]string{
				"X-Forwarded-Access-Token": "oauth2-proxy-main-token",
			},
			wantToken: "",
		},
		{
			name: "authorization bearer must not be used as KMS token",
			headers: map[string]string{
				"Authorization": "Bearer some-bearer-token",
			},
			wantToken: "",
		},
		{
			name: "valid X-KMS-Access-Token",
			headers: map[string]string{
				"X-KMS-Access-Token": "ya29.valid-kms-step-up-token",
			},
			wantToken: "ya29.valid-kms-step-up-token",
		},
		{
			name: "whitespace padded X-KMS-Access-Token",
			headers: map[string]string{
				"X-KMS-Access-Token": "  ya29.trimmed-token  ",
			},
			wantToken: "ya29.trimmed-token",
		},
		{
			name: "null or undefined strings in X-KMS-Access-Token",
			headers: map[string]string{
				"X-KMS-Access-Token": "null",
			},
			wantToken: "",
		},
		{
			name: "undefined in X-KMS-Access-Token",
			headers: map[string]string{
				"X-KMS-Access-Token": "undefined",
			},
			wantToken: "",
		},
		{
			name: "X-KMS-Access-Token takes precedence over other headers",
			headers: map[string]string{
				"Authorization":            "Bearer bearer-token",
				"X-Forwarded-Access-Token": "forwarded-token",
				"X-KMS-Access-Token":       "actual-kms-token",
			},
			wantToken: "actual-kms-token",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/families", nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}

			got := ExtractKmsAccessToken(req)
			if got != tt.wantToken {
				t.Errorf("ExtractKmsAccessToken() = %q, want %q", got, tt.wantToken)
			}
		})
	}
}
