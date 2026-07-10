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

	_, err = conn.Exec(ctx, "ALTER TABLE children ADD COLUMN IF NOT EXISTS group2_start_date DATE;")
	if err != nil {
		log.Fatalf("Alter table failed: %v", err)
	}

	fmt.Println("Successfully added group2_start_date column to children table.")
}
