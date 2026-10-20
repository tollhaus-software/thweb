package database

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func TestApplySchemaMigrations(t *testing.T) {
	adminURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	adminDB, err := sql.Open("pgx", adminURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to postgres: %v", err)
	}
	defer adminDB.Close()

	if err := adminDB.Ping(); err != nil {
		t.Skipf("skipping test: unable to ping postgres: %v", err)
	}

	testDBName := "thweb_test_migration_db"
	_, _ = adminDB.Exec("DROP DATABASE IF EXISTS " + testDBName)
	if _, err := adminDB.Exec("CREATE DATABASE " + testDBName); err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}
	defer func() {
		_, _ = adminDB.Exec("DROP DATABASE IF EXISTS " + testDBName)
	}()

	testDBURL := "postgres://postgres:postgres@localhost:5432/" + testDBName + "?sslmode=disable"
	testDB, err := sql.Open("pgx", testDBURL)
	if err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}
	defer testDB.Close()

	if _, err := testDB.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`); err != nil {
		t.Fatalf("failed to enable uuid-ossp extension: %v", err)
	}

	ApplySchemaMigrations(context.Background(), testDBURL)

	// Verify meal_plan_from_sheets table and cook_name column
	var cookNameCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'meal_plan_from_sheets' AND column_name = 'cook_name';
	`).Scan(&cookNameCol)
	if err != nil {
		t.Fatalf("expected cook_name column to exist in meal_plan_from_sheets: %v", err)
	}
	if cookNameCol != "cook_name" {
		t.Errorf("expected column_name 'cook_name', got %q", cookNameCol)
	}

	// Verify parents.emails is jsonb
	var emailsColType string
	err = testDB.QueryRow(`
		SELECT data_type 
		FROM information_schema.columns 
		WHERE table_name = 'parents' AND column_name = 'emails';
	`).Scan(&emailsColType)
	if err != nil {
		t.Fatalf("expected emails column to exist in parents: %v", err)
	}
	if emailsColType != "jsonb" {
		t.Errorf("expected emails data_type 'jsonb', got %q", emailsColType)
	}

	// Verify parents.phones is jsonb
	var phonesColType string
	err = testDB.QueryRow(`
		SELECT data_type 
		FROM information_schema.columns 
		WHERE table_name = 'parents' AND column_name = 'phones';
	`).Scan(&phonesColType)
	if err != nil {
		t.Fatalf("expected phones column to exist in parents: %v", err)
	}
	if phonesColType != "jsonb" {
		t.Errorf("expected phones data_type 'jsonb', got %q", phonesColType)
	}

	// Verify parents.address column
	var addressCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'parents' AND column_name = 'address';
	`).Scan(&addressCol)
	if err != nil {
		t.Fatalf("expected address column to exist in parents: %v", err)
	}
	if addressCol != "address" {
		t.Errorf("expected column_name 'address', got %q", addressCol)
	}

	// Verify roles.deny_permissions column
	var denyPermsCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'roles' AND column_name = 'deny_permissions';
	`).Scan(&denyPermsCol)
	if err != nil {
		t.Fatalf("expected deny_permissions column to exist in roles: %v", err)
	}
	if denyPermsCol != "deny_permissions" {
		t.Errorf("expected column_name 'deny_permissions', got %q", denyPermsCol)
	}

	// Verify children_group_changes table exists
	var groupChangesTable string
	err = testDB.QueryRow(`
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' AND table_name = 'children_group_changes';
	`).Scan(&groupChangesTable)
	if err != nil {
		t.Fatalf("expected children_group_changes table to exist: %v", err)
	}

	// Verify yellow_bag_dates view exists
	var yellowBagView string
	err = testDB.QueryRow(`
		SELECT table_name 
		FROM information_schema.views 
		WHERE table_schema = 'public' AND table_name = 'yellow_bag_dates';
	`).Scan(&yellowBagView)
	if err != nil {
		t.Fatalf("expected yellow_bag_dates view to exist: %v", err)
	}

	// Test rollback of initial migration
	if err := goose.DownContext(context.Background(), testDB, "migrations"); err != nil {
		t.Fatalf("failed to roll back migration 00001: %v", err)
	}

	var rolesTable string
	err = testDB.QueryRow(`
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' AND table_name = 'roles';
	`).Scan(&rolesTable)
	if err != sql.ErrNoRows {
		t.Errorf("expected roles table to be dropped after rolling back migration 00001, got err: %v", err)
	}

	// Test re-applying migrations after rollback
	ApplySchemaMigrations(context.Background(), testDBURL)

	err = testDB.QueryRow(`
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' AND table_name = 'roles';
	`).Scan(&rolesTable)
	if err != nil {
		t.Fatalf("expected roles table to exist after re-applying migrations: %v", err)
	}
}
