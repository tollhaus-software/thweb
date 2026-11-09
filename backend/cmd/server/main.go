package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/api"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/metrics"
	"github.com/pavolmarko/thweb-backend/internal/roles"
	"github.com/pavolmarko/thweb-backend/internal/store"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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

	// Initialize Vaccination KMS Provider (human step-up auth only; no ambient credentials)
	var kmsProvider crypto.KMSProvider
	vaccinationKeyPath := os.Getenv("GCP_KMS_VACCINATION_KEY_PATH")
	if vaccinationKeyPath == "" {
		vaccinationKeyPath = os.Getenv("GCP_KMS_KEY_PATH")
	}

	if allowMockAuth || vaccinationKeyPath == "" || vaccinationKeyPath == "mock" {
		log.Println("[INFO] Using Mock KMS Provider for vaccination data (local testing/development).")
		kmsProvider = crypto.NewMockKMSProvider()
	} else {
		log.Printf("[INFO] Initializing GCP Cloud KMS Provider for vaccination data with Key: %s (per-request user OAuth credentials)\n", vaccinationKeyPath)
		kmsProvider = crypto.NewGCPKMSProvider(nil, vaccinationKeyPath)
	}

	// Initialize Allergies KMS Provider (scoped service account credentials)
	var allergiesKMSProvider crypto.KMSProvider
	allergiesKeyPath := os.Getenv("GCP_KMS_ALLERGIES_KEY_PATH")
	allergiesCredsFile := os.Getenv("GCP_KMS_ALLERGIES_CREDENTIALS_FILE")

	if allowMockAuth || allergiesKeyPath == "" || allergiesKeyPath == "mock" {
		log.Println("[INFO] Using Mock KMS Provider for allergies data (local testing/development).")
		allergiesKMSProvider = crypto.NewMockKMSProvider()
	} else if info, err := os.Stat(allergiesCredsFile); err != nil || info.Size() == 0 {
		log.Printf("[WARNING] GCP_KMS_ALLERGIES_CREDENTIALS_FILE (%q) is missing or empty; allergies KMS provider will remain unavailable until provisioned.\n", allergiesCredsFile)
	} else {
		log.Printf("[INFO] Initializing GCP Cloud KMS Provider for allergies data with Key: %s (credentials file: %s)\n", allergiesKeyPath, allergiesCredsFile)
		gcpAllergiesProvider, err := crypto.NewGCPKMSProviderFromCredentialsFile(ctx, allergiesCredsFile, allergiesKeyPath)
		if err != nil {
			log.Printf("[WARNING] Failed to initialize GCP Cloud KMS Provider for allergies: %v\n", err)
		} else {
			defer gcpAllergiesProvider.Close()
			allergiesKMSProvider = gcpAllergiesProvider
		}
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

	// Initialize user & feature activity recorder (standalone monitoring DB if configured)
	var activityPool *pgxpool.Pool
	if activityDBURL := os.Getenv("ACTIVITY_DATABASE_URL"); activityDBURL != "" {
		cfg, err := pgxpool.ParseConfig(activityDBURL)
		if err != nil {
			log.Printf("[WARNING] Invalid ACTIVITY_DATABASE_URL: %v\n", err)
		} else {
			cfg.MaxConns = 3
			ap, err := pgxpool.NewWithConfig(ctx, cfg)
			if err != nil {
				log.Printf("[WARNING] Unable to connect to ACTIVITY_DATABASE_URL: %v\n", err)
			} else {
				defer ap.Close()
				activityPool = ap
			}
		}
	}
	activityRecorder := metrics.NewActivityRecorder(activityPool)
	if activityPool != nil {
		activityRecorder.EnsureSchema(ctx)
		go activityRecorder.StartFlushLoop(ctx, 60*time.Second)

		if os.Getenv("USER_ACTIVITY_PURGE_ENABLED") == "true" {
			retentionDays := 30
			if v := os.Getenv("USER_ACTIVITY_RETENTION_DAYS"); v != "" {
				if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
					retentionDays = parsed
				}
			}
			go activityRecorder.StartPurgeLoop(ctx, retentionDays)
		}
	}
	authenticator.ActivityRecorder = activityRecorder

	metricsAddr := os.Getenv("METRICS_ADDR")
	if metricsAddr == "" {
		metricsAddr = ":9100"
	}
	if metricsAddr != "off" && metricsAddr != "disabled" {
		metricsMux := http.NewServeMux()
		promHandler := promhttp.Handler()
		metricsMux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
			if appStore != nil {
				mCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
				if stats, err := appStore.GetEmailOutboxStats(mCtx); err == nil && stats != nil {
					metrics.EmailOutboxOldestPendingAgeSeconds.Set(stats.OldestPendingAgeSeconds)
					metrics.EmailOutboxPendingRows.Set(float64(stats.PendingCount))
					metrics.EmailOutboxFailedRows.Set(float64(stats.FailedCount))
				}
				cancel()
			}
			promHandler.ServeHTTP(w, r)
		})
		metricsMux.HandleFunc("/internal/activity", activityRecorder.HandleInternalActivity)
		go func() {
			log.Printf("Internal metrics & activity server listening on %s\n", metricsAddr)
			if err := http.ListenAndServe(metricsAddr, metricsMux); err != nil && err != http.ErrServerClosed {
				log.Printf("[WARNING] Internal metrics server failed: %v\n", err)
			}
		}()
	}

	hub := api.NewHub()
	go hub.Run()

	r := api.SetupRouter(appStore, authenticator, hub, kmsProvider, allergiesKMSProvider)

	srv := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	log.Println("Server running on http://localhost:8080")
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v\n", err)
	}
}
