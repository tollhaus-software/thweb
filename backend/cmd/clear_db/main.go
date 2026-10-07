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

	_, err = conn.Exec(ctx, "TRUNCATE TABLE children, parents, families, audit_log, children_group_changes CASCADE;")
	if err != nil {
		log.Fatalf("Truncate query failed: %v", err)
	}

	fmt.Println("Successfully truncated children, parents, families, audit_log, and children_group_changes tables.")
}
