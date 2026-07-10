package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"google.golang.org/api/idtoken"
)

type contextKey string

const UserContextKey contextKey = "user"

type Authenticator struct {
	GoogleClientID string
	DB             *pgxpool.Pool
}

func NewAuthenticator(clientID string, db *pgxpool.Pool) *Authenticator {
	return &Authenticator{
		GoogleClientID: clientID,
		DB:             db,
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

		var user models.User
		err := a.DB.QueryRow(r.Context(),
			"SELECT id, email, role, permissions FROM users WHERE email = $1",
			email).Scan(&user.ID, &user.Email, &user.Role, &user.Permissions)

		if err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, "User not allowed", http.StatusForbidden)
				return
			}
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUser(ctx context.Context) *models.User {
	user, ok := ctx.Value(UserContextKey).(*models.User)
	if !ok {
		return nil
	}
	return user
}
