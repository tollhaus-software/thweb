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

	// 3. Test that SyncRoles preserves existing database roles (e.g. modified via Admin UI)
	// while still seeding any new roles introduced in YAML.
	_, err = pool.Exec(ctx, `
		UPDATE roles
		SET name = 'Caregiver Custom', permissions = '["contacts.all.read", "hygiene.all.read"]'::jsonb
		WHERE id = 'caregiver_default'
	`)
	if err != nil {
		t.Fatalf("failed to simulate admin UI role update: %v", err)
	}

	customYAML := `
roles:
  - id: caregiver_default
    name: Caregiver (default)
    description: Default access for caregivers
    permissions:
      - contacts.all.read
  - id: newly_introduced_role
    name: Newly Introduced Role
    description: Seeded on new deployment
    permissions:
      - audit.view
`
	customCfg, err := roles.LoadFromBytes([]byte(customYAML))
	if err != nil {
		t.Fatalf("LoadFromBytes failed: %v", err)
	}
	if err := SyncRoles(ctx, pool, customCfg); err != nil {
		t.Fatalf("SyncRoles update failed: %v", err)
	}

	var preservedName, preservedPerms string
	err = pool.QueryRow(ctx, "SELECT name, permissions::text FROM roles WHERE id = 'caregiver_default'").Scan(&preservedName, &preservedPerms)
	if err != nil {
		t.Fatalf("failed to query preserved role: %v", err)
	}
	if preservedName != "Caregiver Custom" || !strings.Contains(preservedPerms, "hygiene.all.read") {
		t.Errorf("expected existing role customization to be preserved across SyncRoles, got name=%q perms=%s", preservedName, preservedPerms)
	}

	var newRoleName string
	err = pool.QueryRow(ctx, "SELECT name FROM roles WHERE id = 'newly_introduced_role'").Scan(&newRoleName)
	if err != nil {
		t.Fatalf("expected newly_introduced_role to be seeded: %v", err)
	}
	if newRoleName != "Newly Introduced Role" {
		t.Errorf("expected 'Newly Introduced Role', got %q", newRoleName)
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
