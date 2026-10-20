package database

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pavolmarko/thweb-backend/internal/roles"
)

func TestSyncRolesAndSeedMockUsers(t *testing.T) {
	adminDB, err := sql.Open("pgx", "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable")
	if err != nil {
		t.Skipf("skipping test; cannot connect to postgres: %v", err)
	}
	if err := adminDB.Ping(); err != nil {
		t.Skipf("skipping test; cannot ping postgres: %v", err)
	}
	defer adminDB.Close()

	testDBName := "thweb_test_roles_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	if _, err := adminDB.Exec("CREATE DATABASE " + testDBName); err != nil {
		t.Fatalf("failed to create test db: %v", err)
	}
	defer func() {
		_, _ = adminDB.Exec("DROP DATABASE IF EXISTS " + testDBName)
	}()

	testDBURL := "postgres://postgres:postgres@localhost:5432/" + testDBName + "?sslmode=disable"
	ctx := context.Background()

	testDB, err := sql.Open("pgx", testDBURL)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	if _, err := testDB.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`); err != nil {
		t.Fatalf("failed to enable uuid-ossp extension: %v", err)
	}
	testDB.Close()

	// 1. Run migrations first to create schema (without default roles)
	ApplySchemaMigrations(ctx, testDBURL)

	pool, err := pgxpool.New(ctx, testDBURL)
	if err != nil {
		t.Fatalf("failed to connect pgxpool: %v", err)
	}
	defer pool.Close()

	// Verify roles table is empty after migrations
	var initialRoleCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM roles").Scan(&initialRoleCount); err != nil {
		t.Fatalf("failed to count roles: %v", err)
	}
	if initialRoleCount != 0 {
		t.Errorf("expected 0 roles after migration, got %d", initialRoleCount)
	}

	// 2. Sync roles from Config
	cfg := roles.LoadDefault()
	if err := SyncRoles(ctx, pool, cfg); err != nil {
		t.Fatalf("SyncRoles failed: %v", err)
	}

	var syncedRoleCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM roles").Scan(&syncedRoleCount); err != nil {
		t.Fatalf("failed to count roles: %v", err)
	}
	if syncedRoleCount != len(cfg.Roles) {
		t.Errorf("expected %d roles synced, got %d", len(cfg.Roles), syncedRoleCount)
	}

	// 3. Test idempotent update
	customYAML := `
roles:
  - id: viewer
    name: Viewer Updated
    description: Updated description
    permissions:
      - families.all.read
`
	customCfg, err := roles.LoadFromBytes([]byte(customYAML))
	if err != nil {
		t.Fatalf("LoadFromBytes failed: %v", err)
	}
	if err := SyncRoles(ctx, pool, customCfg); err != nil {
		t.Fatalf("SyncRoles update failed: %v", err)
	}

	var updatedName, updatedDesc string
	err = pool.QueryRow(ctx, "SELECT name, description FROM roles WHERE id = 'viewer'").Scan(&updatedName, &updatedDesc)
	if err != nil {
		t.Fatalf("failed to query updated role: %v", err)
	}
	if updatedName != "Viewer Updated" || updatedDesc != "Updated description" {
		t.Errorf("expected updated role name & description, got %q, %q", updatedName, updatedDesc)
	}

	// 4. Test SeedMockUsers
	if err := SeedMockUsers(ctx, pool, cfg); err != nil {
		t.Fatalf("SeedMockUsers failed: %v", err)
	}

	var devRoleCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM user_roles ur
		JOIN users u ON ur.user_id = u.id
		WHERE u.email = 'developer@example.com' AND ur.role_id = 'admin'
	`).Scan(&devRoleCount)
	if err != nil {
		t.Fatalf("failed to query developer user roles: %v", err)
	}
	if devRoleCount != 1 {
		t.Errorf("expected developer to have admin role, got count %d", devRoleCount)
	}
}
