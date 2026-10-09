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

func TestIsAllowedKioskPath(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"/api/dashboard/daily-brief", true},
		{"/api/dashboard/daily-brief/", true},
		{"/api/daily-brief", true},
		{"/api/daily-brief/", true},
		{"/ws", true},
		{"/ws/", true},
		{"/api/ws", true},
		{"/api/ws/", true},
		{"/api/families", false},
		{"/api/admin/users", false},
		{"/api/me", false},
		{"/", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := IsAllowedKioskPath(tt.path); got != tt.want {
				t.Errorf("IsAllowedKioskPath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestAuthenticator_Middleware_Kiosk(t *testing.T) {
	auth := NewAuthenticator("mock-client-id", false, nil)

	tests := []struct {
		name        string
		path        string
		headers     map[string]string
		wantStatus  int
		wantKiosk   bool
		wantKioskDN string
	}{
		{
			name: "kiosk allowed on /api/dashboard/daily-brief with verified client cert",
			path: "/api/dashboard/daily-brief",
			headers: map[string]string{
				"X-Client-Verified": "SUCCESS",
				"X-Client-DN":       "CN=kiosk-tablet-1",
			},
			wantStatus:  http.StatusOK,
			wantKiosk:   true,
			wantKioskDN: "CN=kiosk-tablet-1",
		},
		{
			name: "kiosk allowed on /ws without client DN",
			path: "/ws",
			headers: map[string]string{
				"X-Client-Verified": "SUCCESS",
			},
			wantStatus: http.StatusOK,
			wantKiosk:  true,
		},
		{
			name: "kiosk rejected on sensitive path even if X-Client-Verified is SUCCESS",
			path: "/api/families",
			headers: map[string]string{
				"X-Client-Verified": "SUCCESS",
			},
			wantStatus: http.StatusUnauthorized,
			wantKiosk:  false,
		},
		{
			name: "kiosk rejected on /api/dashboard/daily-brief when client verification failed",
			path: "/api/dashboard/daily-brief",
			headers: map[string]string{
				"X-Client-Verified": "FAILED: certificate revoked",
			},
			wantStatus: http.StatusUnauthorized,
			wantKiosk:  false,
		},
		{
			name: "kiosk rejected when client verification is missing",
			path: "/api/dashboard/daily-brief",
			headers: map[string]string{},
			wantStatus: http.StatusUnauthorized,
			wantKiosk:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var recordedUser *models.UserWithPermissions
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				recordedUser = GetUser(r.Context())
				w.WriteHeader(http.StatusOK)
			})

			handler := auth.Middleware(next)

			req := httptest.NewRequest("GET", tt.path, nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("Middleware() status = %d, want %d", rec.Code, tt.wantStatus)
			}

			if tt.wantKiosk {
				if recordedUser == nil {
					t.Fatal("expected recordedUser in context, got nil")
				}
				if !recordedUser.HasPermission("dashboard.read") {
					t.Errorf("expected user to have 'dashboard.read' permission, got: %v", recordedUser.EffectivePermissions)
				}
				if tt.wantKioskDN != "" {
					expectedEmail := "kiosk+" + tt.wantKioskDN + "@internal"
					if recordedUser.Email != expectedEmail {
						t.Errorf("expected user email %q, got %q", expectedEmail, recordedUser.Email)
					}
				}
			}
		})
	}
}

