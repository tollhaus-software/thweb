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

	ApplySchemaMigrations(context.Background(), testDBURL, false)

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

	// Test rollback of migration 00009
	if err := goose.DownContext(context.Background(), testDB, "migrations"); err != nil {
		t.Fatalf("failed to roll back migration 00009: %v", err)
	}

	var rolledBackCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'meal_plan_from_sheets' AND column_name = 'cook_name';
	`).Scan(&rolledBackCol)
	if err != sql.ErrNoRows {
		t.Errorf("expected cook_name column to be dropped after rolling back migration 00009, got err: %v", err)
	}
}

func TestApplySchemaMigrations_ExistingTable(t *testing.T) {
	adminURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	adminDB, err := sql.Open("pgx", adminURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to postgres: %v", err)
	}
	defer adminDB.Close()

	if err := adminDB.Ping(); err != nil {
		t.Skipf("skipping test: unable to ping postgres: %v", err)
	}

	testDBName := "thweb_test_existing_tbl_db"
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

	// Pre-create meal_plan_from_sheets table WITHOUT cook_name, simulating a database that had
	// the table created prior to migration 00009
	if _, err := testDB.Exec(`
		CREATE TABLE meal_plan_from_sheets (
			date DATE PRIMARY KEY,
			fetched_at TIMESTAMPTZ NOT NULL,
			food_component_1 TEXT NOT NULL DEFAULT '',
			food_component_2 TEXT NOT NULL DEFAULT '',
			food_component_3 TEXT NOT NULL DEFAULT ''
		);
	`); err != nil {
		t.Fatalf("failed to pre-create table: %v", err)
	}

	ApplySchemaMigrations(context.Background(), testDBURL, false)

	var cookNameCol string
	err = testDB.QueryRow(`
		SELECT column_name 
		FROM information_schema.columns 
		WHERE table_name = 'meal_plan_from_sheets' AND column_name = 'cook_name';
	`).Scan(&cookNameCol)
	if err != nil {
		t.Fatalf("expected cook_name column to exist after applying migrations: %v", err)
	}
	if cookNameCol != "cook_name" {
		t.Errorf("expected column_name 'cook_name', got %q", cookNameCol)
	}
}
