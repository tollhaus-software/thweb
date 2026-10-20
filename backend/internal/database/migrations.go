package database

import (
	"context"
	"database/sql"
	"embed"
	"log"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

func ApplySchemaMigrations(ctx context.Context, dbURL string) {
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Printf("[MIGRATION ERROR] Failed to connect to database for migrations: %v", err)
		return
	}
	defer db.Close()

	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("postgres"); err != nil {
		log.Printf("[MIGRATION ERROR] Failed to set goose dialect: %v", err)
		return
	}

	log.Printf("[MIGRATION] Applying database schema migrations using Goose...")
	if err := goose.UpContext(ctx, db, "migrations"); err != nil {
		log.Printf("[MIGRATION ERROR] Schema migration failed: %v", err)
		return
	}
	log.Printf("[MIGRATION SUCCESS] Database schema is up to date.")
}
