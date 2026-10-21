package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/roles"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func getTestPool(t *testing.T) *pgxpool.Pool {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("skipping test: unable to ping db: %v", err)
	}
	return pool
}

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

func TestRequirePermission_AuditView(t *testing.T) {
	middleware := RequirePermission("audit.view")
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
			name: "allowed with explicit audit.view permission",
			user: &models.UserWithPermissions{
				Email:                "auditor@example.com",
				EffectivePermissions: []string{"audit.view"},
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
			name: "forbidden without audit.view permission",
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
			name: "null string literal in header returns empty when no fallback",
			url:  "/ws",
			headers: map[string]string{
				"Authorization": "Bearer null",
			},
			wantToken: "",
		},
		{
			name: "Bearer null falls back to X-Forwarded-ID-Token",
			url:  "/api/fees/calculate",
			headers: map[string]string{
				"Authorization":        "Bearer null",
				"X-Forwarded-ID-Token": "forwarded-id-token-abc",
			},
			wantToken: "forwarded-id-token-abc",
		},
		{
			name: "Bearer undefined falls back to X-Forwarded-ID-Token",
			url:  "/api/fees/calculate",
			headers: map[string]string{
				"Authorization":        "Bearer undefined",
				"X-Forwarded-ID-Token": "forwarded-id-token-abc",
			},
			wantToken: "forwarded-id-token-abc",
		},
		{
			name: "Bearer null and X-Forwarded-ID-Token null falls back to query token",
			url:  "/ws?token=query-token-value",
			headers: map[string]string{
				"Authorization":        "Bearer null",
				"X-Forwarded-ID-Token": "null",
			},
			wantToken: "query-token-value",
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

func TestAuthenticator_Middleware_ProxySharedSecret(t *testing.T) {
	testSecret := "test-proxy-secret-12345"
	auth := NewAuthenticator("mock-client-id", false, nil)
	auth.ProxySharedSecret = testSecret

	tests := []struct {
		name       string
		headers    map[string]string
		wantStatus int
		wantEmail  string
	}{
		{
			name: "trusted proxy request with valid secret and email",
			headers: map[string]string{
				"X-Proxy-Secret":    testSecret,
				"X-Forwarded-Email": "staff@tollhaus-stuttgart.de",
			},
			wantStatus: http.StatusOK,
			wantEmail:  "staff@tollhaus-stuttgart.de",
		},
		{
			name: "spoofed proxy request with incorrect secret rejected",
			headers: map[string]string{
				"X-Proxy-Secret":    "wrong-secret",
				"X-Forwarded-Email": "attacker@example.com",
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "missing secret rejected even if X-Forwarded-Email is set",
			headers: map[string]string{
				"X-Forwarded-Email": "attacker@example.com",
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "valid secret but X-Forwarded-Email is null literal rejected",
			headers: map[string]string{
				"X-Proxy-Secret":    testSecret,
				"X-Forwarded-Email": "null",
			},
			wantStatus: http.StatusUnauthorized,
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

			req := httptest.NewRequest("GET", "/api/families", nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("Middleware() status = %d, want %d", rec.Code, tt.wantStatus)
			}

			if tt.wantEmail != "" {
				if recordedUser == nil {
					t.Fatal("expected recordedUser in context, got nil")
				}
				if recordedUser.Email != tt.wantEmail {
					t.Errorf("expected email %q, got %q", tt.wantEmail, recordedUser.Email)
				}
			}
		})
	}
}

func TestAuthenticator_Middleware_RestrictedUser(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := store.NewStore(pool)
	authenticator := NewAuthenticator("test-client-id", false, appStore)
	authenticator.ProxySharedSecret = "secret123"

	testUserID := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2)", testUserID, "test-user-"+testUserID.String()+"@example.com")
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	familyID := uuid.New()
	parentID := uuid.New()
	identEmail := "parent.ident." + uuid.New().String() + "@example.com"

	parent := models.Parent{
		ID:        parentID,
		FamilyID:  familyID,
		FirstName: "Restricted",
		LastName:  "Parent",
		Emails: models.MultiValueList{
			{Value: identEmail, IdentifierEmail: true, AddressList: true},
		},
		Phones: models.MultiValueList{},
	}
	if err := appStore.UpdateFamilyParents(ctx, testUserID, familyID, []models.Parent{parent}); err != nil {
		t.Fatalf("failed to seed parent: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, familyID)
	}()

	var recordedUser *models.UserWithPermissions
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordedUser = GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authenticator.Middleware(next)

	// 1. Request as identifier email (not in users table) -> 200 OK, restricted role & permissions
	req := httptest.NewRequest("GET", "/api/families/overview", nil)
	req.Header.Set("X-Proxy-Secret", "secret123")
	req.Header.Set("X-Forwarded-Email", identEmail)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for restricted user, got %d (%s)", rec.Code, rec.Body.String())
	}
	if recordedUser == nil {
		t.Fatal("expected recordedUser in context, got nil")
	}
	if recordedUser.FamilyID == nil || *recordedUser.FamilyID != familyID {
		t.Errorf("expected FamilyID %s, got %v", familyID, recordedUser.FamilyID)
	}
	if !recordedUser.HasPermission("families.all.restrictedread") {
		t.Error("expected user to have families.all.restrictedread")
	}
	if !recordedUser.HasPermission("fees.self.read") {
		t.Error("expected user to have fees.self.read")
	}
	if !recordedUser.HasPermission("families.self.selfservice") {
		t.Error("expected user to have families.self.selfservice")
	}

	// 2. Request as unknown email (neither in users nor parents identifier email) -> 403 Forbidden
	reqUnknown := httptest.NewRequest("GET", "/api/families/overview", nil)
	reqUnknown.Header.Set("X-Proxy-Secret", "secret123")
	reqUnknown.Header.Set("X-Forwarded-Email", "stranger@example.com")
	recUnknown := httptest.NewRecorder()

	handler.ServeHTTP(recUnknown, reqUnknown)
	if recUnknown.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for unknown user, got %d", recUnknown.Code)
	}
}

func TestAuthenticator_AutoGrantFromRolesConfig(t *testing.T) {
	customYAML := `
roles:
  - id: custom_kiosk
    name: Custom Kiosk
    description: Custom kiosk display
    auto_grant_on:
      - kiosk_cert
    permissions:
      - dashboard.read
      - mealplan.view
`
	cfg, err := roles.LoadFromBytes([]byte(customYAML))
	if err != nil {
		t.Fatalf("failed to load custom roles: %v", err)
	}

	authenticator := NewAuthenticator("test-client", false, nil, cfg)

	var recordedUser *models.UserWithPermissions
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordedUser = GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := authenticator.Middleware(testHandler)

	req := httptest.NewRequest("GET", "/api/dashboard/daily-brief", nil)
	req.Header.Set("X-Client-Verified", "SUCCESS")
	req.Header.Set("X-Client-DN", "CN=kiosk-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	if recordedUser == nil {
		t.Fatal("expected recorded user")
	}
	if len(recordedUser.Roles) != 1 || recordedUser.Roles[0] != "custom_kiosk" {
		t.Errorf("expected role custom_kiosk, got %v", recordedUser.Roles)
	}
	if !recordedUser.HasPermission("mealplan.view") {
		t.Errorf("expected permission mealplan.view from custom kiosk role")
	}
}

func TestAuthenticator_DenyPermissions_CaregiverOrErzieher(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()
	database.ApplySchemaMigrations(ctx, dbURL)

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	customYAML := `
roles:
  - id: erzieher
    name: ErzieherInnenTeam
    description: Erzieher/Erzieherinnen
    permissions:
      - families.all.restrictedread
      - mealplan.view
    deny_permissions:
      - fees.self.read

  - id: parent_default
    name: Parent (default)
    auto_grant_on:
      - parent_identifier_email
    permissions:
      - families.all.restrictedread
      - fees.self.read
      - families.self.selfservice
      - memberships.self.read

  - id: caregiver_default
    name: Caregiver (default)
    auto_grant_on:
      - caregiver_identifier_email
    permissions:
      - families.all.restrictedread
      - mealplan.view
`
	cfg, err := roles.LoadFromBytes([]byte(customYAML))
	if err != nil {
		t.Fatalf("failed to parse custom roles: %v", err)
	}

	appStore := store.NewStore(pool)
	authenticator := NewAuthenticator("test-client", false, appStore, cfg)
	authenticator.ProxySharedSecret = "secret123"

	// Create user with role erzieher
	erzieherEmail := "erzieher." + uuid.New().String() + "@example.com"
	erzieherID := uuid.New()

	// Ensure role exists in roles table
	if _, err := pool.Exec(ctx, "INSERT INTO roles (id, name, permissions, deny_permissions) VALUES ('erzieher', 'Erzieher', '[\"families.all.restrictedread\", \"mealplan.view\"]'::jsonb, '[\"fees.self.read\"]'::jsonb) ON CONFLICT (id) DO UPDATE SET deny_permissions = '[\"fees.self.read\"]'::jsonb"); err != nil {
		t.Fatalf("failed to insert erzieher role: %v", err)
	}

	_, err = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2)", erzieherID, erzieherEmail)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM user_roles WHERE user_id = $1", erzieherID)
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", erzieherID)
	}()

	_, err = pool.Exec(ctx, "INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'erzieher')", erzieherID)
	if err != nil {
		t.Fatalf("failed to assign role: %v", err)
	}

	// Create a family where this erzieher is also a parent with identifier email!
	familyID := uuid.New()
	parent := models.Parent{
		ID:        uuid.New(),
		FamilyID:  familyID,
		FirstName: "Educator",
		LastName:  "Parent",
		Emails: models.MultiValueList{
			{Value: erzieherEmail, IdentifierEmail: true, AddressList: true},
		},
		Phones: models.MultiValueList{},
	}
	if err := appStore.UpdateFamilyParents(ctx, erzieherID, familyID, []models.Parent{parent}); err != nil {
		t.Fatalf("failed to seed parent: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, erzieherID, familyID)
	}()

	var recordedUser *models.UserWithPermissions
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordedUser = GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authenticator.Middleware(next)

	req := httptest.NewRequest("GET", "/api/families/overview", nil)
	req.Header.Set("X-Proxy-Secret", "secret123")
	req.Header.Set("X-Forwarded-Email", erzieherEmail)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d (%s)", rec.Code, rec.Body.String())
	}
	if recordedUser == nil {
		t.Fatal("expected recorded user")
	}

	// Verify FamilyID is set (matched identifier email)
	if recordedUser.FamilyID == nil || *recordedUser.FamilyID != familyID {
		t.Errorf("expected FamilyID %s, got %v", familyID, recordedUser.FamilyID)
	}

	// Verify parent self-service permissions from restricted role are present
	if !recordedUser.HasPermission("families.self.selfservice") {
		t.Error("expected user to have families.self.selfservice")
	}
	if !recordedUser.HasPermission("memberships.self.read") {
		t.Error("expected user to have memberships.self.read")
	}

	// Verify role permissions from erzieher role are present
	if !recordedUser.HasPermission("mealplan.view") {
		t.Error("expected user to have mealplan.view")
	}

	// Verify fees.self.read is DENIED because of erzieher deny_permissions!
	if recordedUser.HasPermission("fees.self.read") {
		t.Errorf("expected fees.self.read to be DENIED for erzieher, but user has it in effective_permissions: %v", recordedUser.EffectivePermissions)
	}
}

func TestAuthenticator_EmployeeIdentifierEmail(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()
	ctx := context.Background()

	caregiverEmail := fmt.Sprintf("caregiver-%s@example.com", uuid.New().String()[:8])
	cookEmail := fmt.Sprintf("cook-%s@example.com", uuid.New().String()[:8])

	cfg := roles.LoadDefault()
	appStore := store.NewStore(pool)
	authenticator := NewAuthenticator("test-client", false, appStore, cfg)
	authenticator.ProxySharedSecret = "secret123"

	// Insert caregiver employee with identifier email
	empID := uuid.New()
	emailsJSON := fmt.Sprintf(`[{"value":"%s","identifier_email":true,"address_list":true}]`, caregiverEmail)
	_, err := pool.Exec(ctx, `
		INSERT INTO employees (id, first_name, last_name, employee_type, emails, phones, address, is_kinderschutzbeauftragter)
		VALUES ($1, 'Care', 'Giver', 'caregiver', $2::jsonb, '[]'::jsonb, 'Street 1', false)
	`, empID, emailsJSON)
	if err != nil {
		t.Fatalf("failed to insert employee: %v", err)
	}

	// Insert cook employee with identifier email
	cookID := uuid.New()
	cookEmailsJSON := fmt.Sprintf(`[{"value":"%s","identifier_email":true,"address_list":true}]`, cookEmail)
	_, err = pool.Exec(ctx, `
		INSERT INTO employees (id, first_name, last_name, employee_type, emails, phones, address, is_kinderschutzbeauftragter)
		VALUES ($1, 'Cookie', 'Monster', 'cook', $2::jsonb, '[]'::jsonb, 'Street 2', false)
	`, cookID, cookEmailsJSON)
	if err != nil {
		t.Fatalf("failed to insert cook: %v", err)
	}

	var recordedUser *models.UserWithPermissions
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordedUser = GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authenticator.Middleware(next)

	// 1. Request as caregiver identifier email -> 200 OK, caregiver_default role & permissions
	req := httptest.NewRequest("GET", "/api/families/overview", nil)
	req.Header.Set("X-Proxy-Secret", "secret123")
	req.Header.Set("X-Forwarded-Email", caregiverEmail)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for caregiver identifier email, got %d (%s)", rec.Code, rec.Body.String())
	}
	if recordedUser == nil {
		t.Fatal("expected recordedUser in context, got nil")
	}
	foundRole := false
	for _, r := range recordedUser.Roles {
		if r == "caregiver_default" {
			foundRole = true
			break
		}
	}
	if !foundRole {
		t.Errorf("expected caregiver_default role, got roles: %v", recordedUser.Roles)
	}
	if !recordedUser.HasPermission("families.all.restrictedread") {
		t.Error("expected caregiver to have families.all.restrictedread")
	}
	if !recordedUser.HasPermission("mealplan.view") {
		t.Error("expected caregiver to have mealplan.view")
	}
	if recordedUser.HasPermission("fees.self.read") {
		t.Error("caregiver should not have fees.self.read")
	}

	// 2. Simulate caregiver identifier email
	simUser, err := authenticator.ResolveSimulatedUser(ctx, models.SimulationConfig{
		Active:    true,
		Mode:      "user",
		UserEmail: caregiverEmail,
	})
	if err != nil {
		t.Fatalf("failed to resolve simulated caregiver: %v", err)
	}
	if simUser == nil {
		t.Fatal("expected simulated user, got nil")
	}
	foundRole = false
	for _, r := range simUser.Roles {
		if r == "caregiver_default" {
			foundRole = true
			break
		}
	}
	if !foundRole {
		t.Errorf("expected caregiver_default in simulated roles, got %v", simUser.Roles)
	}
	if !simUser.HasPermission("mealplan.view") {
		t.Error("expected simulated caregiver to have mealplan.view")
	}
}

func TestAuthenticator_Simulation_UserMode(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()
	appStore := store.NewStore(pool)
	ctx := context.Background()

	adminUser, err := appStore.GetUserWithPermissionsByEmail(ctx, "developer@example.com")
	if err != nil {
		t.Fatalf("failed to get developer user: %v", err)
	}

	familyID := uuid.New()
	parentID := uuid.New()
	parentEmail := "simulated.parent@example.com"
	parent := models.Parent{
		ID:        parentID,
		FamilyID:  familyID,
		FirstName: "Simulated",
		LastName:  "Parent",
		Emails: models.MultiValueList{
			{Value: parentEmail, IdentifierEmail: true, AddressList: true},
		},
		Phones: models.MultiValueList{},
	}
	if err := appStore.UpdateFamilyParents(ctx, adminUser.ID, familyID, []models.Parent{parent}); err != nil {
		t.Fatalf("failed to seed parent: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, adminUser.ID, familyID)
	}()

	rolesCfg := roles.LoadDefault()
	authenticator := NewAuthenticator("mock", true, appStore, rolesCfg)

	var recordedUser *models.UserWithPermissions
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordedUser = GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authenticator.Middleware(next)

	simCfg := models.SimulationConfig{
		Active:    true,
		Mode:      "user",
		UserEmail: parentEmail,
	}
	simBytes, _ := json.Marshal(simCfg)

	req := httptest.NewRequest("GET", "/api/families/overview", nil)
	req.Header.Set("Authorization", "Bearer developer@example.com")
	req.AddCookie(&http.Cookie{
		Name:  "thweb_sim",
		Value: url.QueryEscape(string(simBytes)),
	})
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d (%s)", rec.Code, rec.Body.String())
	}
	if recordedUser == nil {
		t.Fatal("expected recorded user")
	}

	// 1. Must still be in real user's name/email/ID
	if recordedUser.Email != "developer@example.com" {
		t.Errorf("expected Email %q, got %q", "developer@example.com", recordedUser.Email)
	}
	if recordedUser.ID != adminUser.ID {
		t.Errorf("expected ID %v, got %v", adminUser.ID, recordedUser.ID)
	}

	// 2. Simulation info attached
	if recordedUser.Simulation == nil || !recordedUser.Simulation.Active {
		t.Fatal("expected active simulation info")
	}
	if recordedUser.Simulation.SimulatedUser != parentEmail {
		t.Errorf("expected simulated user %q, got %q", parentEmail, recordedUser.Simulation.SimulatedUser)
	}

	// 3. Simulated FamilyID applied
	if recordedUser.FamilyID == nil || *recordedUser.FamilyID != familyID {
		t.Errorf("expected FamilyID %s, got %v", familyID, recordedUser.FamilyID)
	}

	// 4. Effective permissions are intersection
	if !recordedUser.HasPermission("families.all.restrictedread") {
		t.Error("expected user to have simulated families.all.restrictedread")
	}
	if !recordedUser.HasPermission("fees.self.read") {
		t.Error("expected user to have simulated fees.self.read")
	}
	// Superadmin wildcard should NOT be in effective permissions since simulated parent doesn't have it
	for _, p := range recordedUser.EffectivePermissions {
		if p == "*" {
			t.Error("wildcard * should NOT be in effective permissions during parent simulation")
		}
	}
	if recordedUser.HasPermission("families.all.write") {
		t.Error("families.all.write should NOT be permitted for simulated parent")
	}
}

func TestAuthenticator_Simulation_CustomMode(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()
	appStore := store.NewStore(pool)

	rolesCfg := roles.LoadDefault()
	authenticator := NewAuthenticator("mock", true, appStore, rolesCfg)

	var recordedUser *models.UserWithPermissions
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordedUser = GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authenticator.Middleware(next)

	simCfg := models.SimulationConfig{
		Active:      true,
		Mode:        "custom",
		Roles:       []string{"viewer"},
		Permissions: []string{"mealplan.view"},
	}
	simBytes, _ := json.Marshal(simCfg)

	req := httptest.NewRequest("GET", "/api/families", nil)
	req.Header.Set("Authorization", "Bearer developer@example.com")
	req.AddCookie(&http.Cookie{
		Name:  "thweb_sim",
		Value: url.QueryEscape(string(simBytes)),
	})
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d (%s)", rec.Code, rec.Body.String())
	}
	if recordedUser == nil {
		t.Fatal("expected recorded user")
	}

	if !recordedUser.HasPermission("families.all.read") {
		t.Error("expected viewer permission families.all.read")
	}
	if !recordedUser.HasPermission("mealplan.view") {
		t.Error("expected direct custom permission mealplan.view")
	}
	if recordedUser.HasPermission("families.all.write") {
		t.Error("families.all.write should NOT be permitted")
	}
}

func TestAuthenticator_Simulation_DeniedForNonAdmin(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()
	appStore := store.NewStore(pool)
	ctx := context.Background()

	viewerEmail := "test.viewer.simulation@example.com"
	created, err := appStore.CreateUser(ctx, viewerEmail, []string{"viewer"}, nil)
	if err != nil {
		t.Fatalf("failed to create viewer user: %v", err)
	}
	defer func() {
		_ = appStore.DeleteUser(ctx, created.ID)
	}()

	rolesCfg := roles.LoadDefault()
	authenticator := NewAuthenticator("mock", true, appStore, rolesCfg)

	var recordedUser *models.UserWithPermissions
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordedUser = GetUser(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authenticator.Middleware(next)

	// Viewer tries to simulate admin
	simCfg := models.SimulationConfig{
		Active:      true,
		Mode:        "custom",
		Roles:       []string{"admin"},
		Permissions: []string{"*"},
	}
	simBytes, _ := json.Marshal(simCfg)

	req := httptest.NewRequest("GET", "/api/families", nil)
	req.Header.Set("Authorization", "Bearer "+viewerEmail)
	req.AddCookie(&http.Cookie{
		Name:  "thweb_sim",
		Value: url.QueryEscape(string(simBytes)),
	})
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	// Simulation must NOT be active because viewer lacks permissions.simulate!
	if recordedUser.Simulation != nil && recordedUser.Simulation.Active {
		t.Error("simulation must NOT be active for user without permissions.simulate")
	}
	if recordedUser.HasPermission("families.all.write") {
		t.Error("viewer must not gain families.all.write through unauthorized simulation")
	}
}


