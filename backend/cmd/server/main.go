package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/api"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func main() {
	ctx := context.Background()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	// Automatically run database migrations on startup
	database.ApplySchemaMigrations(ctx, pool)

	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	if googleClientID == "" {
		log.Fatal("GOOGLE_CLIENT_ID environment variable is required")
	}

	allowMockAuth := os.Getenv("ALLOW_MOCK_AUTH") == "true"
	if googleClientID == "mock" && !allowMockAuth {
		log.Fatal("GOOGLE_CLIENT_ID cannot be 'mock' unless ALLOW_MOCK_AUTH=true is explicitly set for local development")
	}

	if allowMockAuth {
		log.Println("[SECURITY WARNING] ALLOW_MOCK_AUTH=true is set. Mock authentication enabled for local testing.")
	}

	appStore := store.NewStore(pool)
	authenticator := auth.NewAuthenticator(googleClientID, allowMockAuth, appStore)

	hub := api.NewHub()
	go hub.Run()

	r := api.SetupRouter(appStore, authenticator, hub)

	log.Println("Server running on http://localhost:8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatalf("Server failed: %v\n", err)
	}
}
