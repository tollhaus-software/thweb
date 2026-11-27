package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/roles"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func TestAdminRoleHandlers_SystemRoleProtectionAndUpdates(t *testing.T) {
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

	cfg := roles.LoadDefault()
	if err := database.SyncRoles(ctx, pool, cfg); err != nil {
		t.Fatalf("SyncRoles failed: %v", err)
	}

	appStore := store.NewStore(pool)
	authn := auth.NewAuthenticator("mock", true, appStore, cfg)
	srv := &Server{
		Store:         appStore,
		Authenticator: authn,
	}

	// 1. HandleListRoles includes is_system and auto_grant_on metadata
	reqList := httptest.NewRequest("GET", "/api/admin/roles", nil)
	recList := httptest.NewRecorder()
	srv.HandleListRoles(recList, reqList)
	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from HandleListRoles, got %d", recList.Code)
	}

	var listedRoles []models.Role
	if err := json.Unmarshal(recList.Body.Bytes(), &listedRoles); err != nil {
		t.Fatalf("failed to decode roles: %v", err)
	}
	var caregiverRole, viewerRole *models.Role
	for i := range listedRoles {
		if listedRoles[i].ID == "caregiver_default" {
			caregiverRole = &listedRoles[i]
		}
		if listedRoles[i].ID == "viewer" {
			viewerRole = &listedRoles[i]
		}
	}
	if caregiverRole == nil || !caregiverRole.IsSystem || len(caregiverRole.AutoGrantOn) == 0 {
		t.Errorf("expected caregiver_default to have is_system=true and auto_grant_on, got %+v", caregiverRole)
	}
	if viewerRole == nil || viewerRole.IsSystem {
		t.Errorf("expected viewer to have is_system=false, got %+v", viewerRole)
	}

	// 2. HandleDeleteRole rejects deleting system/auto-grant roles (403 Forbidden)
	for _, sysRoleID := range []string{"admin", "caregiver_default", "parent_default", "kiosk"} {
		reqDel := httptest.NewRequest("DELETE", "/api/admin/roles/"+sysRoleID, nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", sysRoleID)
		reqDel = reqDel.WithContext(context.WithValue(reqDel.Context(), chi.RouteCtxKey, rctx))
		recDel := httptest.NewRecorder()

		srv.HandleDeleteRole(recDel, reqDel)
		if recDel.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden when deleting system role %q, got %d", sysRoleID, recDel.Code)
		}
	}

	// 3. HandleUpdateRole rejects removing '*' from admin role (400 Bad Request)
	reqAdminNoStar := httptest.NewRequest("PUT", "/api/admin/roles/admin", strings.NewReader(`{"name":"Administrator","description":"Full access","permissions":["families.all.read"]}`))
	rctxAdmin := chi.NewRouteContext()
	rctxAdmin.URLParams.Add("id", "admin")
	reqAdminNoStar = reqAdminNoStar.WithContext(context.WithValue(reqAdminNoStar.Context(), chi.RouteCtxKey, rctxAdmin))
	recAdminNoStar := httptest.NewRecorder()

	srv.HandleUpdateRole(recAdminNoStar, reqAdminNoStar)
	if recAdminNoStar.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request when removing '*' from admin, got %d", recAdminNoStar.Code)
	}

	// 4. HandleCreateRole + HandleDeleteRole succeeds for custom non-system role
	customRoleID := "temp_custom_role_test"
	defer func() {
		_ = appStore.DeleteRole(ctx, customRoleID)
	}()
	reqCreate := httptest.NewRequest("POST", "/api/admin/roles", strings.NewReader(`{"id":"`+customRoleID+`","name":"Temp Custom","description":"Test","permissions":["audit.view"]}`))
	recCreate := httptest.NewRecorder()
	srv.HandleCreateRole(recCreate, reqCreate)
	if recCreate.Code != http.StatusOK {
		t.Fatalf("expected 200 OK creating custom role, got %d (%s)", recCreate.Code, recCreate.Body.String())
	}

	reqDelCustom := httptest.NewRequest("DELETE", "/api/admin/roles/"+customRoleID, nil)
	rctxCustom := chi.NewRouteContext()
	rctxCustom.URLParams.Add("id", customRoleID)
	reqDelCustom = reqDelCustom.WithContext(context.WithValue(reqDelCustom.Context(), chi.RouteCtxKey, rctxCustom))
	recDelCustom := httptest.NewRecorder()
	srv.HandleDeleteRole(recDelCustom, reqDelCustom)
	if recDelCustom.Code != http.StatusNoContent {
		t.Errorf("expected 204 No Content deleting custom role, got %d", recDelCustom.Code)
	}
}
