package database

import (
	"context"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func ApplySchemaMigrations(ctx context.Context, pool *pgxpool.Pool) {
	schemaPath := "schema.sql"
	if _, err := os.Stat(schemaPath); os.IsNotExist(err) {
		schemaPath = "../../schema.sql"
	}
	content, err := os.ReadFile(schemaPath)
	if err != nil {
		log.Printf("[MIGRATION WARNING] Could not find schema.sql: %v", err)
		return
	}

	log.Printf("[MIGRATION] Applying database schema migrations from %s...", schemaPath)
	_, err = pool.Exec(ctx, string(content))
	if err != nil {
		log.Printf("[MIGRATION ERROR] Schema execution failed: %v", err)
	} else {
		log.Printf("[MIGRATION SUCCESS] Database schema is up to date.")
	}
}
