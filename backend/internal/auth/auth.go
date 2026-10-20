package auth

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/roles"
	"github.com/pavolmarko/thweb-backend/internal/store"
	"google.golang.org/api/idtoken"
)

type contextKey string

const UserContextKey contextKey = "user"
const AccessTokenContextKey contextKey = "access_token"

type Authenticator struct {
	GoogleClientID    string
	AllowMockAuth     bool
	ProxySharedSecret string
	Store             *store.Store
	RolesConfig       *roles.Config
}

func NewAuthenticator(clientID string, allowMockAuth bool, store *store.Store, rolesConfig ...*roles.Config) *Authenticator {
	var rc *roles.Config
	if len(rolesConfig) > 0 && rolesConfig[0] != nil {
		rc = rolesConfig[0]
	} else {
		rc = roles.LoadDefault()
	}
	return &Authenticator{
		GoogleClientID: clientID,
		AllowMockAuth:  allowMockAuth,
		Store:          store,
		RolesConfig:    rc,
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

		// 1. Check if request is authenticated via client certificate (mTLS) from edge gateway
		if r.Header.Get("X-Client-Verified") == "SUCCESS" && IsAllowedKioskPath(r.URL.Path) {
			dn := strings.TrimSpace(r.Header.Get("X-Client-DN"))
			kioskEmail := "kiosk@internal"
			if dn != "" {
				kioskEmail = "kiosk+" + dn + "@internal"
			}
			kioskRoles, kioskPerms := a.RolesConfig.RolesForTrigger(roles.AutoGrantKioskCert)
			if len(kioskRoles) == 0 {
				kioskRoles = []string{"kiosk"}
			}
			if len(kioskPerms) == 0 {
				kioskPerms = []string{"dashboard.read"}
			}
			kioskUser := &models.UserWithPermissions{
				Email:                kioskEmail,
				Roles:                kioskRoles,
				Permissions:          kioskPerms,
				EffectivePermissions: kioskPerms,
			}
			if a.RolesConfig != nil && len(kioskUser.Roles) > 0 {
				denied := a.RolesConfig.DeniedPermissionsForRoles(kioskUser.Roles)
				kioskUser.RemovePermissions(denied)
			}
			ctx := context.WithValue(r.Context(), UserContextKey, kioskUser)
			ctx = context.WithValue(ctx, AccessTokenContextKey, rawAccessToken)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		var email string

		// 2. Check if request is authenticated via trusted reverse proxy with shared secret
		proxySecret := strings.TrimSpace(r.Header.Get("X-Proxy-Secret"))
		if a.ProxySharedSecret != "" && proxySecret != "" && subtle.ConstantTimeCompare([]byte(proxySecret), []byte(a.ProxySharedSecret)) == 1 {
			if headerEmail := strings.TrimSpace(r.Header.Get("X-Forwarded-Email")); headerEmail != "" && headerEmail != "null" && headerEmail != "undefined" {
				email = headerEmail
			}
		}

		// 3. Fallback to Google ID token or mock auth if not authenticated via proxy secret
		if email == "" {
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
				// Standalone zero-trust mode: Require valid Google ID token cryptographically verified against Google RSA keys
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
		}

		email = models.NormalizeEmail(email)

		var user *models.UserWithPermissions
		if a.Store != nil {
			var err error
			user, err = a.Store.GetUserWithPermissionsByEmail(r.Context(), email)
			if err != nil {
				if err == pgx.ErrNoRows {
					familyID, pErr := a.Store.GetFamilyIDByIdentifierEmail(r.Context(), email)
					if pErr != nil {
						log.Printf("[AUTH ERROR] Failed to check identifier email %q: %v", email, pErr)
						writeJSONError(w, "Database error: "+pErr.Error(), http.StatusInternalServerError)
						return
					}
					if familyID == nil {
						log.Printf("[AUTH WARNING] User email %q not found in allow-list or identifier emails", email)
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusForbidden)
						json.NewEncoder(w).Encode(map[string]string{
							"error": "User not allowed",
							"email": email,
						})
						return
					}
					identRoles, identPerms := a.RolesConfig.RolesForTrigger(roles.AutoGrantIdentifierEmail)
					if len(identRoles) == 0 {
						identRoles = []string{"restricted"}
					}
					if len(identPerms) == 0 {
						identPerms = []string{
							"families.all.restrictedread",
							"fees.self.read",
							"families.self.selfservice",
						}
					}
					user = &models.UserWithPermissions{
						Email:                email,
						Roles:                identRoles,
						Permissions:          identPerms,
						EffectivePermissions: identPerms,
						FamilyID:             familyID,
					}
				} else {
					log.Printf("[AUTH ERROR] Failed to fetch user %q from database: %v", email, err)
					writeJSONError(w, "Database error: "+err.Error(), http.StatusInternalServerError)
					return
				}
			} else {
				familyID, pErr := a.Store.GetFamilyIDByIdentifierEmail(r.Context(), email)
				if pErr == nil && familyID != nil {
					user.FamilyID = familyID
					identRoles, implicitPerms := a.RolesConfig.RolesForTrigger(roles.AutoGrantIdentifierEmail)
					if len(implicitPerms) == 0 {
						implicitPerms = []string{
							"families.all.restrictedread",
							"fees.self.read",
							"families.self.selfservice",
						}
					}
					for _, ir := range identRoles {
						found := false
						for _, r := range user.Roles {
							if r == ir {
								found = true
								break
							}
						}
						if !found {
							user.Roles = append(user.Roles, ir)
						}
					}
					permSet := make(map[string]bool)
					for _, p := range user.EffectivePermissions {
						permSet[p] = true
					}
					for _, p := range implicitPerms {
						permSet[p] = true
					}
					user.EffectivePermissions = make([]string, 0, len(permSet))
					for p := range permSet {
						user.EffectivePermissions = append(user.EffectivePermissions, p)
					}
				}
			}
		} else {
			user = &models.UserWithPermissions{
				Email: email,
			}
		}

		user.EnsureImpliedPermissions()

		if a.RolesConfig != nil && len(user.Roles) > 0 {
			denied := a.RolesConfig.DeniedPermissionsForRoles(user.Roles)
			user.RemovePermissions(denied)
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		ctx = context.WithValue(ctx, AccessTokenContextKey, rawAccessToken)
		next.ServeHTTP(w, r.WithContext(ctx))
		return
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
	idToken = strings.TrimSpace(idToken)
	if idToken == "null" || idToken == "undefined" {
		idToken = ""
	}

	if idToken == "" {
		idToken = strings.TrimSpace(r.Header.Get("X-Forwarded-ID-Token"))
		if idToken == "null" || idToken == "undefined" {
			idToken = ""
		}
	}

	if idToken == "" {
		if q := r.URL.Query().Get("token"); q != "" {
			idToken = strings.TrimSpace(q)
		} else if q := r.URL.Query().Get("id_token"); q != "" {
			idToken = strings.TrimSpace(q)
		}
		if idToken == "null" || idToken == "undefined" {
			idToken = ""
		}
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
