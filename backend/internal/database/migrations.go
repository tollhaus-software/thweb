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

func ApplySchemaMigrations(ctx context.Context, dbURL string, allowMockAuth bool) {
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

	if allowMockAuth {
		log.Println("[MIGRATION] Seeding mock developer user (developer@example.com) for local testing...")
		_, err := db.ExecContext(ctx, `
			INSERT INTO users (email) VALUES ('developer@example.com') ON CONFLICT (email) DO NOTHING;
			INSERT INTO user_roles (user_id, role_id)
			SELECT id, 'admin' FROM users WHERE email = 'developer@example.com'
			ON CONFLICT (user_id, role_id) DO NOTHING;
		`)
		if err != nil {
			log.Printf("[MIGRATION ERROR] Failed to seed mock user: %v", err)
		}
	}
}
