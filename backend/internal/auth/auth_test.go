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

func TestExtractIDToken(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		headers   map[string]string
		wantToken string
	}{
		{
			name:      "no token provided",
			url:       "/ws",
			headers:   map[string]string{},
			wantToken: "",
		},
		{
			name: "bearer token in Authorization header",
			url:  "/ws",
			headers: map[string]string{
				"Authorization": "Bearer my-id-token-123",
			},
			wantToken: "my-id-token-123",
		},
		{
			name: "token in X-Forwarded-ID-Token header",
			url:  "/ws",
			headers: map[string]string{
				"X-Forwarded-ID-Token": "forwarded-id-token-456",
			},
			wantToken: "forwarded-id-token-456",
		},
		{
			name:      "token in query parameter ?token=",
			url:       "/ws?token=query-token-789",
			headers:   map[string]string{},
			wantToken: "query-token-789",
		},
		{
			name:      "token in query parameter ?id_token=",
			url:       "/ws?id_token=query-id-token-abc",
			headers:   map[string]string{},
			wantToken: "query-id-token-abc",
		},
		{
			name: "Authorization header takes precedence over X-Forwarded-ID-Token and query",
			url:  "/ws?token=query-token",
			headers: map[string]string{
				"Authorization":        "Bearer auth-header-token",
				"X-Forwarded-ID-Token": "forwarded-token",
			},
			wantToken: "auth-header-token",
		},
		{
			name: "X-Forwarded-ID-Token takes precedence over query",
			url:  "/ws?token=query-token",
			headers: map[string]string{
				"X-Forwarded-ID-Token": "forwarded-token",
			},
			wantToken: "forwarded-token",
		},
		{
			name: "null string literal in header returns empty",
			url:  "/ws",
			headers: map[string]string{
				"Authorization": "Bearer null",
			},
			wantToken: "",
		},
		{
			name:      "undefined string literal in query returns empty",
			url:       "/ws?token=undefined",
			headers:   map[string]string{},
			wantToken: "",
		},
		{
			name:      "whitespace in token is trimmed",
			url:       "/ws?token=%20%20trimmed-token%20%20",
			headers:   map[string]string{},
			wantToken: "trimmed-token",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}

			got := ExtractIDToken(req)
			if got != tt.wantToken {
				t.Errorf("ExtractIDToken() = %q, want %q", got, tt.wantToken)
			}
		})
	}
}

