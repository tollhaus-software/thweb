package auth

import (
	"context"
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
	Store          *store.Store
}

func NewAuthenticator(clientID string, store *store.Store) *Authenticator {
	return &Authenticator{
		GoogleClientID: clientID,
		Store:          store,
	}
}

func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		idToken := strings.TrimPrefix(authHeader, "Bearer ")
		var email string
		if a.GoogleClientID == "mock" {
			email = idToken
		} else {
			payload, err := idtoken.Validate(r.Context(), idToken, a.GoogleClientID)
			if err != nil {
				http.Error(w, "Invalid token", http.StatusUnauthorized)
				return
			}
			email = payload.Claims["email"].(string)
		}

		user, err := a.Store.GetUserWithPermissionsByEmail(r.Context(), email)
		if err != nil {
			if err == pgx.ErrNoRows {
				log.Printf("[AUTH WARNING] User email %q not found in allow-list", email)
				http.Error(w, "User not allowed", http.StatusForbidden)
				return
			}
			log.Printf("[AUTH ERROR] Failed to fetch user %q from database: %v", email, err)
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
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
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
