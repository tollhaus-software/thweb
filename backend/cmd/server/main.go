package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/api"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/roles"
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

	// Initialize KMS Provider
	var kmsProvider crypto.KMSProvider
	kmsKeyPath := os.Getenv("GCP_KMS_KEY_PATH")

	if allowMockAuth || kmsKeyPath == "" || kmsKeyPath == "mock" {
		log.Println("[INFO] Using Mock KMS Provider for local testing/development.")
		kmsProvider = crypto.NewMockKMSProvider()
	} else {
		log.Printf("[INFO] Initializing GCP Cloud KMS Provider with Key: %s (per-request user OAuth credentials)\n", kmsKeyPath)
		kmsProvider = crypto.NewGCPKMSProvider(nil, kmsKeyPath)
	}

	// Automatically run database migrations on startup
	database.ApplySchemaMigrations(ctx, dbURL)

	// Load roles configuration from deployment file (or fallback to embedded default)
	rolesFilePath := os.Getenv("ROLES_FILE")
	rolesConfig, err := roles.LoadConfig(rolesFilePath)
	if err != nil {
		log.Fatalf("Failed to load roles configuration: %v\n", err)
	}

	// Synchronize roles into PostgreSQL
	if err := database.SyncRoles(ctx, pool, rolesConfig); err != nil {
		log.Fatalf("Failed to synchronize roles to database: %v\n", err)
	}

	// If mock auth is enabled, seed mock accounts based on roles with auto_grant_on containing mock_auth
	if allowMockAuth {
		if err := database.SeedMockUsers(ctx, pool, rolesConfig); err != nil {
			log.Printf("[WARNING] Failed to seed mock users: %v\n", err)
		}
	}

	appStore := store.NewStore(pool)
	authenticator := auth.NewAuthenticator(googleClientID, allowMockAuth, appStore, rolesConfig)
	if proxySecret := os.Getenv("PROXY_SHARED_SECRET"); proxySecret != "" {
		authenticator.ProxySharedSecret = proxySecret
		log.Println("[INFO] Proxy shared secret verification enabled.")
	}

	hub := api.NewHub()
	go hub.Run()

	r := api.SetupRouter(appStore, authenticator, hub, kmsProvider)

	log.Println("Server running on http://localhost:8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatalf("Server failed: %v\n", err)
	}
}
