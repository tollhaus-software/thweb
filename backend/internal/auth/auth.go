package auth

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
	"google.golang.org/api/idtoken"
)

type contextKey string

const UserContextKey contextKey = "user"

type Authenticator struct {
	GoogleClientID string
	AllowMockAuth  bool
	Store          *store.Store
}

func NewAuthenticator(clientID string, allowMockAuth bool, store *store.Store) *Authenticator {
	return &Authenticator{
		GoogleClientID: clientID,
		AllowMockAuth:  allowMockAuth,
		Store:          store,
	}
}

func writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var email string

		// Extract ID token from standard Authorization Bearer header (RFC 6750)
		var idToken string
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			idToken = strings.TrimPrefix(authHeader, "Bearer ")
		}

		if idToken == "null" || idToken == "undefined" {
			idToken = ""
		}

		if a.AllowMockAuth {
			// Local development mode (ALLOW_MOCK_AUTH=true)
			if headerEmail := r.Header.Get("X-Forwarded-Email"); headerEmail != "" && headerEmail != "null" && headerEmail != "undefined" {
				email = headerEmail
			} else if idToken != "" {
				email = idToken
			} else {
				email = "developer@example.com"
			}
		} else {
			// Production zero-trust mode: Require valid Google ID token cryptographically verified against Google RSA keys
			if idToken == "" {
				writeJSONError(w, "Unauthorized: missing ID token", http.StatusUnauthorized)
				return
			}

			payload, err := idtoken.Validate(r.Context(), idToken, a.GoogleClientID)
			if err != nil {
				log.Printf("[AUTH ERROR] Google ID token validation failed: %v", err)
				writeJSONError(w, "Invalid Google ID token", http.StatusUnauthorized)
				return
			}

			emailClaim, ok := payload.Claims["email"].(string)
			if !ok || emailClaim == "" {
				writeJSONError(w, "Token missing email claim", http.StatusUnauthorized)
				return
			}
			email = emailClaim
		}

		user, err := a.Store.GetUserWithPermissionsByEmail(r.Context(), email)
		if err != nil {
			if err == pgx.ErrNoRows {
				log.Printf("[AUTH WARNING] User email %q not found in allow-list", email)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "User not allowed",
					"email": email,
				})
				return
			}
			log.Printf("[AUTH ERROR] Failed to fetch user %q from database: %v", email, err)
			writeJSONError(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUser(ctx context.Context) *models.UserWithPermissions {
	user, ok := ctx.Value(UserContextKey).(*models.UserWithPermissions)
	if !ok {
		return nil
	}
	return user
}

func RequirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUser(r.Context())
			if user == nil || !user.HasPermission(perm) {
				writeJSONError(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
