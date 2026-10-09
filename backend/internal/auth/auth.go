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
const AccessTokenContextKey contextKey = "access_token"

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

// IsAllowedKioskPath returns true if the request path is permitted for mTLS kiosk access.
func IsAllowedKioskPath(path string) bool {
	cleanPath := strings.TrimSuffix(path, "/")
	return cleanPath == "/api/dashboard/daily-brief" ||
		cleanPath == "/api/daily-brief" ||
		cleanPath == "/ws" ||
		cleanPath == "/api/ws"
}

func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawAccessToken := ExtractKmsAccessToken(r)

		// Check if request is authenticated via client certificate (mTLS) from edge gateway
		if r.Header.Get("X-Client-Verified") == "SUCCESS" && IsAllowedKioskPath(r.URL.Path) {
			dn := strings.TrimSpace(r.Header.Get("X-Client-DN"))
			kioskEmail := "kiosk@internal"
			if dn != "" {
				kioskEmail = "kiosk+" + dn + "@internal"
			}
			kioskUser := &models.UserWithPermissions{
				Email:                kioskEmail,
				Roles:                []string{"kiosk"},
				Permissions:          []string{"dashboard.read"},
				EffectivePermissions: []string{"dashboard.read"},
			}
			ctx := context.WithValue(r.Context(), UserContextKey, kioskUser)
			ctx = context.WithValue(ctx, AccessTokenContextKey, rawAccessToken)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		var email string

		idToken := ExtractIDToken(r)

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

		email = models.NormalizeEmail(email)

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
		ctx = context.WithValue(ctx, AccessTokenContextKey, rawAccessToken)
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

func ExtractIDToken(r *http.Request) string {
	var idToken string
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		idToken = strings.TrimPrefix(authHeader, "Bearer ")
	}

	if idToken == "" {
		idToken = r.Header.Get("X-Forwarded-ID-Token")
	}

	if idToken == "" {
		if q := r.URL.Query().Get("token"); q != "" {
			idToken = q
		} else if q := r.URL.Query().Get("id_token"); q != "" {
			idToken = q
		}
	}

	idToken = strings.TrimSpace(idToken)
	if idToken == "null" || idToken == "undefined" {
		return ""
	}
	return idToken
}

func ExtractKmsAccessToken(r *http.Request) string {
	raw := strings.TrimSpace(r.Header.Get("X-KMS-Access-Token"))
	if raw == "null" || raw == "undefined" {
		return ""
	}
	return raw
}

func GetAccessToken(ctx context.Context) string {
	token, _ := ctx.Value(AccessTokenContextKey).(string)
	return token
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
