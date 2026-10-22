package database

import (
	"context"
	"database/sql"
	"strings"
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

	// Verify parents.first_name_for_address_list exists
	var parentAddrNameCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'parents' AND column_name = 'first_name_for_address_list';
	`).Scan(&parentAddrNameCol)
	if err != nil {
		t.Fatalf("expected first_name_for_address_list column in parents: %v", err)
	}

	// Verify children.first_name_for_address_list exists
	var childAddrNameCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'children' AND column_name = 'first_name_for_address_list';
	`).Scan(&childAddrNameCol)
	if err != nil {
		t.Fatalf("expected first_name_for_address_list column in children: %v", err)
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

	// Verify children.familiencards column exists
	var familiencardsCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'children' AND column_name = 'familiencards';
	`).Scan(&familiencardsCol)
	if err != nil {
		t.Fatalf("expected familiencards column to exist in children: %v", err)
	}
	if familiencardsCol != "familiencards" {
		t.Errorf("expected column_name 'familiencards', got %q", familiencardsCol)
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

	// Verify data_encryption_keys table exists
	var dekTable string
	err = testDB.QueryRow(`
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' AND table_name = 'data_encryption_keys';
	`).Scan(&dekTable)
	if err != nil {
		t.Fatalf("expected data_encryption_keys table to exist: %v", err)
	}

	// Verify children.allergies_protected and employees.allergies_protected columns exist
	var childAllergiesCol string
	err = testDB.QueryRow(`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = 'children' AND column_name = 'allergies_protected';
	`).Scan(&childAllergiesCol)
	if err != nil {
		t.Fatalf("expected allergies_protected column in children: %v", err)
	}
	var empAllergiesCol string
	err = testDB.QueryRow(`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = 'employees' AND column_name = 'allergies_protected';
	`).Scan(&empAllergiesCol)
	if err != nil {
		t.Fatalf("expected allergies_protected column in employees: %v", err)
	}

	// Verify migration 00004: test phone number type defaulting to "mobile"
	// Roll back to migration 3, insert untyped phones, then migrate up to 4
	if err := goose.DownToContext(context.Background(), testDB, "migrations", 3); err != nil {
		t.Fatalf("failed to down to migration 3: %v", err)
	}

	var famID string
	err = testDB.QueryRow(`INSERT INTO families DEFAULT VALUES RETURNING id`).Scan(&famID)
	if err != nil {
		t.Fatalf("failed to insert test family: %v", err)
	}

	var parentID string
	err = testDB.QueryRow(`
		INSERT INTO parents (family_id, first_name, last_name, phones)
		VALUES ($1, 'Hans', 'Muster', '[{"value": "123456", "address_list": true}, {"value": "789012", "type": "landline"}]'::jsonb)
		RETURNING id
	`, famID).Scan(&parentID)
	if err != nil {
		t.Fatalf("failed to insert test parent: %v", err)
	}

	var empID string
	err = testDB.QueryRow(`
		INSERT INTO employees (first_name, last_name, employee_type, phones)
		VALUES ('Lisa', 'Muster', 'caregiver', '[{"value": "555666", "address_list": false}, "999888"]'::jsonb)
		RETURNING id
	`).Scan(&empID)
	if err != nil {
		t.Fatalf("failed to insert test employee: %v", err)
	}

	// Run migration 4
	if err := goose.UpToContext(context.Background(), testDB, "migrations", 4); err != nil {
		t.Fatalf("failed to run migration 4: %v", err)
	}

	// Verify parent phones migrated
	var parentPhonesJSON string
	err = testDB.QueryRow(`SELECT phones::text FROM parents WHERE id = $1`, parentID).Scan(&parentPhonesJSON)
	if err != nil {
		t.Fatalf("failed to query parent phones: %v", err)
	}
	if !strings.Contains(parentPhonesJSON, `"type": "mobile"`) {
		t.Errorf("expected parent untyped phone to get mobile type, got %s", parentPhonesJSON)
	}
	if !strings.Contains(parentPhonesJSON, `"type": "landline"`) {
		t.Errorf("expected parent landline phone to preserve type, got %s", parentPhonesJSON)
	}

	// Verify employee phones migrated
	var empPhonesJSON string
	err = testDB.QueryRow(`SELECT phones::text FROM employees WHERE id = $1`, empID).Scan(&empPhonesJSON)
	if err != nil {
		t.Fatalf("failed to query employee phones: %v", err)
	}
	if !strings.Contains(empPhonesJSON, `"type": "mobile"`) {
		t.Errorf("expected employee untyped phone to get mobile type, got %s", empPhonesJSON)
	}

	// Test rollback of all migrations
	if err := goose.ResetContext(context.Background(), testDB, "migrations"); err != nil {
		t.Fatalf("failed to roll back migrations: %v", err)
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
