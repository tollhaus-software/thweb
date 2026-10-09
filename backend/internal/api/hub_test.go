package api

import (
	"net/http/httptest"
	"os"
	"testing"

	"github.com/pavolmarko/thweb-backend/internal/auth"
)

func TestCheckOrigin(t *testing.T) {
	tests := []struct {
		name        string
		origin      string
		host        string
		envOrigins  string
		envDomain   string
		wantAllowed bool
	}{
		{
			name:        "empty origin (non-browser or CLI client)",
			origin:      "",
			host:        "example.com",
			wantAllowed: true,
		},
		{
			name:        "exact same origin host without port",
			origin:      "https://example.com",
			host:        "example.com",
			wantAllowed: true,
		},
		{
			name:        "exact same origin host with matching port",
			origin:      "https://example.com:8443",
			host:        "example.com:8443",
			wantAllowed: true,
		},
		{
			name:        "same hostname with different port",
			origin:      "http://example.com:3000",
			host:        "example.com:8080",
			wantAllowed: true,
		},
		{
			name:        "localhost origin with different ports (local dev)",
			origin:      "http://localhost:5173",
			host:        "localhost:8080",
			wantAllowed: true,
		},
		{
			name:        "127.0.0.1 origin (local dev)",
			origin:      "http://127.0.0.1:3000",
			host:        "127.0.0.1:8080",
			wantAllowed: true,
		},
		{
			name:        "IPv6 loopback origin",
			origin:      "http://[::1]:5173",
			host:        "[::1]:8080",
			wantAllowed: true,
		},
		{
			name:        "cross-site attacker origin rejected",
			origin:      "https://evil.com",
			host:        "my-kiosk.example.com",
			wantAllowed: false,
		},
		{
			name:        "attacker trying localhost subdomain spoofing rejected",
			origin:      "https://localhost.evil.com",
			host:        "example.com",
			wantAllowed: false,
		},
		{
			name:        "attacker trying target domain suffix spoofing rejected",
			origin:      "https://example.com.evil.com",
			host:        "example.com",
			wantAllowed: false,
		},
		{
			name:        "malformed origin URL rejected",
			origin:      "://bad-url",
			host:        "example.com",
			wantAllowed: false,
		},
		{
			name:        "allowed via ALLOWED_ORIGINS env variable",
			origin:      "https://trusted-dashboard.internal",
			host:        "backend.internal:8080",
			envOrigins:  "https://other.internal,https://trusted-dashboard.internal",
			wantAllowed: true,
		},
		{
			name:        "allowed via DOMAIN_NAME env variable",
			origin:      "https://kiosk.example.com",
			host:        "backend:8080",
			envDomain:   "kiosk.example.com",
			wantAllowed: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envOrigins != "" {
				os.Setenv("ALLOWED_ORIGINS", tt.envOrigins)
				defer os.Unsetenv("ALLOWED_ORIGINS")
			} else {
				os.Unsetenv("ALLOWED_ORIGINS")
			}

			if tt.envDomain != "" {
				os.Setenv("DOMAIN_NAME", tt.envDomain)
				defer os.Unsetenv("DOMAIN_NAME")
			} else {
				os.Unsetenv("DOMAIN_NAME")
			}

			req := httptest.NewRequest("GET", "/ws", nil)
			req.Host = tt.host
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			allowed := CheckOrigin(req)
			if allowed != tt.wantAllowed {
				t.Errorf("CheckOrigin() = %v, want %v (origin=%q, host=%q)", allowed, tt.wantAllowed, tt.origin, tt.host)
			}
		})
	}
}

func TestRouter_WebSocketRequiresAuthentication(t *testing.T) {
	// Create authenticator with production mode (allowMockAuth = false)
	authn := auth.NewAuthenticator("google-client-id-123", false, nil)
	hub := NewHub()
	router := SetupRouter(nil, authn, hub, nil)

	// 1. Request to /ws without credentials should be rejected with 401 Unauthorized
	req := httptest.NewRequest("GET", "/ws", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != 401 {
		t.Errorf("/ws unauthenticated status = %d, want 401 Unauthorized", rec.Code)
	}

	// 2. Request to /api/ws alias without credentials should also be rejected with 401 Unauthorized
	reqAlias := httptest.NewRequest("GET", "/api/ws", nil)
	recAlias := httptest.NewRecorder()
	router.ServeHTTP(recAlias, reqAlias)

	if recAlias.Code != 401 {
		t.Errorf("/api/ws unauthenticated status = %d, want 401 Unauthorized", recAlias.Code)
	}

	// 3. /health must remain unauthenticated (200 OK)
	reqHealth := httptest.NewRequest("GET", "/health", nil)
	recHealth := httptest.NewRecorder()
	router.ServeHTTP(recHealth, reqHealth)

	if recHealth.Code != 200 {
		t.Errorf("/health status = %d, want 200 OK", recHealth.Code)
	}
}

