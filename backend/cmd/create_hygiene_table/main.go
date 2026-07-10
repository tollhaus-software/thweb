package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer conn.Close(ctx)

	queries := []string{
		`CREATE TABLE IF NOT EXISTS hygiene_belehrung_events (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
			event_date DATE NOT NULL,
			event_type TEXT NOT NULL CHECK (event_type IN ('initial', 'recertify')),
			documentation TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`DROP TRIGGER IF EXISTS update_hygiene_belehrung_events_updated_at ON hygiene_belehrung_events;`,
		`CREATE TRIGGER update_hygiene_belehrung_events_updated_at BEFORE UPDATE ON hygiene_belehrung_events FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();`,
	}

	for _, q := range queries {
		_, err = conn.Exec(ctx, q)
		if err != nil {
			log.Fatalf("Execution failed for query %s: %v", q, err)
		}
	}

	fmt.Println("Successfully created hygiene_belehrung_events table and updated triggers.")
}
