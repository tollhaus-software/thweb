package auth

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"
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
		cleanPath == "/api/dashboard/allergies" ||
		cleanPath == "/api/allergies/summary" ||
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
				kioskPerms = []string{"dashboard.read", "allergies.summary.read"}
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
					empTypes, eErr := a.Store.GetEmployeeTypesByIdentifierEmail(r.Context(), email)
					if eErr != nil {
						log.Printf("[AUTH ERROR] Failed to check employee identifier email %q: %v", email, eErr)
						writeJSONError(w, "Database error: "+eErr.Error(), http.StatusInternalServerError)
						return
					}
					triggers := a.TriggersForIdentifierEmail(familyID, empTypes)
					if len(triggers) == 0 {
						log.Printf("[AUTH WARNING] User email %q not found in allow-list or identifier emails", email)
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusForbidden)
						json.NewEncoder(w).Encode(map[string]string{
							"error": "User not allowed",
							"email": email,
						})
						return
					}
					identRoles, identPerms := a.RolesAndPermissionsForTriggers(triggers)
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
				}
				empTypes, _ := a.Store.GetEmployeeTypesByIdentifierEmail(r.Context(), email)
				triggers := a.TriggersForIdentifierEmail(familyID, empTypes)
				if len(triggers) > 0 {
					identRoles, implicitPerms := a.RolesAndPermissionsForTriggers(triggers)
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

		// 4. Check if role/permissions simulation is active
		simCfg := ExtractSimulationConfig(r)
		if simCfg != nil && simCfg.Active {
			if user.HasPermission("permissions.simulate") {
				simUser, err := a.ResolveSimulatedUser(r.Context(), *simCfg)
				if err == nil && simUser != nil {
					intersected := models.IntersectPermissions(user.EffectivePermissions, simUser.EffectivePermissions)
					activeUser := &models.UserWithPermissions{
						ID:                   user.ID,
						Email:                user.Email,
						Roles:                simUser.Roles,
						Permissions:          simUser.Permissions,
						EffectivePermissions: intersected,
						FamilyID:             simUser.FamilyID,
						LastLogin:            user.LastLogin,
						CreatedAt:            user.CreatedAt,
						UpdatedAt:            user.UpdatedAt,
						ActualUser:           user,
						Simulation: &models.SimulationInfo{
							Active:                       true,
							Mode:                         simCfg.Mode,
							SimulatedUser:                simCfg.UserEmail,
							SimulatedRoles:               simUser.Roles,
							SimulatedPermissions:         simUser.Permissions,
							OriginalEmail:                user.Email,
							OriginalRoles:                user.Roles,
							OriginalEffectivePermissions: user.EffectivePermissions,
						},
					}
					user = activeUser
				} else {
					log.Printf("[AUTH WARNING] Failed to resolve simulated user: %v", err)
				}
			} else {
				log.Printf("[AUTH WARNING] Simulation requested by %q without permissions.simulate; ignoring simulation", user.Email)
			}
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		ctx = context.WithValue(ctx, AccessTokenContextKey, rawAccessToken)
		next.ServeHTTP(w, r.WithContext(ctx))
		return
	})
}

// ExtractSimulationConfig extracts simulation parameters from cookie or request headers.
func ExtractSimulationConfig(r *http.Request) *models.SimulationConfig {
	// 1. Try Cookie "thweb_sim"
	if cookie, err := r.Cookie("thweb_sim"); err == nil && cookie.Value != "" {
		val := cookie.Value
		if unescaped, err := url.QueryUnescape(val); err == nil {
			val = unescaped
		}
		var cfg models.SimulationConfig
		if err := json.Unmarshal([]byte(val), &cfg); err == nil && cfg.Active {
			return &cfg
		}
	}

	// 2. Try Header "X-Simulation"
	if h := r.Header.Get("X-Simulation"); h != "" {
		var cfg models.SimulationConfig
		if err := json.Unmarshal([]byte(h), &cfg); err == nil && cfg.Active {
			return &cfg
		}
	}

	// 3. Try individual headers
	if mode := strings.TrimSpace(r.Header.Get("X-Simulation-Mode")); mode != "" {
		cfg := &models.SimulationConfig{
			Active:    true,
			Mode:      mode,
			UserEmail: strings.TrimSpace(r.Header.Get("X-Simulation-User")),
		}
		if rolesH := strings.TrimSpace(r.Header.Get("X-Simulation-Roles")); rolesH != "" {
			for _, r := range strings.Split(rolesH, ",") {
				if trimmed := strings.TrimSpace(r); trimmed != "" {
					cfg.Roles = append(cfg.Roles, trimmed)
				}
			}
		}
		if permsH := strings.TrimSpace(r.Header.Get("X-Simulation-Permissions")); permsH != "" {
			for _, p := range strings.Split(permsH, ",") {
				if trimmed := strings.TrimSpace(p); trimmed != "" {
					cfg.Permissions = append(cfg.Permissions, trimmed)
				}
			}
		}
		return cfg
	}

	return nil
}

// TriggersForIdentifierEmail returns all auto-grant triggers applicable to the given parent and employee identifiers.
func (a *Authenticator) TriggersForIdentifierEmail(familyID *uuid.UUID, empTypes []string) []string {
	var triggers []string
	if familyID != nil {
		triggers = append(triggers, roles.AutoGrantParentIdentifierEmail)
	}
	for _, t := range empTypes {
		tr := roles.EmployeeTypeToTrigger(t)
		if tr != "" {
			triggers = append(triggers, tr)
		}
	}
	return triggers
}

// RolesAndPermissionsForTriggers resolves configured (or fallback) roles and deduplicated permissions for the given triggers.
func (a *Authenticator) RolesAndPermissionsForTriggers(triggers []string) ([]string, []string) {
	var allRoles []string
	seenRoles := make(map[string]bool)
	permSet := make(map[string]bool)

	for _, trigger := range triggers {
		var rIDs, perms []string
		if a.RolesConfig != nil {
			rIDs, perms = a.RolesConfig.RolesForTrigger(trigger)
		}
		if len(rIDs) == 0 {
			switch trigger {
			case roles.AutoGrantParentIdentifierEmail:
				rIDs = []string{"parent_default"}
				perms = []string{
					"families.all.restrictedread",
					"fees.self.read",
					"families.self.selfservice",
					"memberships.self.read",
					"allergies.summary.read",
					"meal_allergens.read",
					"meal_allergens.write",
				}
			case roles.AutoGrantCaregiverIdentifierEmail:
				rIDs = []string{"caregiver_default"}
				perms = []string{
					"families.all.restrictedread",
					"mealplan.view",
					"allergies.summary.read",
					"meal_allergens.read",
					"meal_allergens.write",
				}
			case roles.AutoGrantCookIdentifierEmail:
				rIDs = []string{"cook_default"}
				perms = []string{
					"mealplan.view",
					"allergies.summary.read",
					"meal_allergens.read",
					"meal_allergens.write",
				}
			}
		}
		for _, r := range rIDs {
			if !seenRoles[r] {
				seenRoles[r] = true
				allRoles = append(allRoles, r)
			}
		}
		for _, p := range perms {
			permSet[p] = true
		}
	}

	allPerms := make([]string, 0, len(permSet))
	for p := range permSet {
		allPerms = append(allPerms, p)
	}
	return allRoles, allPerms
}

// ResolveSimulatedUser determines the roles, permissions, and family ID for a simulated target.
func (a *Authenticator) ResolveSimulatedUser(ctx context.Context, cfg models.SimulationConfig) (*models.UserWithPermissions, error) {
	if cfg.Mode == "user" {
		email := models.NormalizeEmail(cfg.UserEmail)
		if email == "" {
			return nil, fmt.Errorf("user email is required for user simulation")
		}

		var simUser *models.UserWithPermissions
		if a.Store != nil {
			u, err := a.Store.GetUserWithPermissionsByEmail(ctx, email)
			if err == nil {
				simUser = u
			} else if err != pgx.ErrNoRows {
				return nil, err
			}

			familyID, pErr := a.Store.GetFamilyIDByIdentifierEmail(ctx, email)
			if pErr != nil {
				return nil, pErr
			}
			empTypes, eErr := a.Store.GetEmployeeTypesByIdentifierEmail(ctx, email)
			if eErr != nil {
				return nil, eErr
			}
			triggers := a.TriggersForIdentifierEmail(familyID, empTypes)

			if simUser == nil && len(triggers) == 0 {
				return nil, fmt.Errorf("user %q not found in known users or identifying emails", email)
			}

			if simUser == nil {
				// Pure identifying parent or employee
				identRoles, identPerms := a.RolesAndPermissionsForTriggers(triggers)
				simUser = &models.UserWithPermissions{
					Email:                email,
					Roles:                identRoles,
					Permissions:          identPerms,
					EffectivePermissions: identPerms,
					FamilyID:             familyID,
				}
			} else if len(triggers) > 0 {
				if familyID != nil {
					simUser.FamilyID = familyID
				}
				identRoles, implicitPerms := a.RolesAndPermissionsForTriggers(triggers)
				for _, ir := range identRoles {
					found := false
					for _, r := range simUser.Roles {
						if r == ir {
							found = true
							break
						}
					}
					if !found {
						simUser.Roles = append(simUser.Roles, ir)
					}
				}
				permSet := make(map[string]bool)
				for _, p := range simUser.EffectivePermissions {
					permSet[p] = true
				}
				for _, p := range implicitPerms {
					permSet[p] = true
				}
				simUser.EffectivePermissions = make([]string, 0, len(permSet))
				for p := range permSet {
					simUser.EffectivePermissions = append(simUser.EffectivePermissions, p)
				}
			}
		} else {
			simUser = &models.UserWithPermissions{Email: email}
		}

		simUser.EnsureImpliedPermissions()
		if a.RolesConfig != nil && len(simUser.Roles) > 0 {
			denied := a.RolesConfig.DeniedPermissionsForRoles(simUser.Roles)
			simUser.RemovePermissions(denied)
		}
		return simUser, nil
	}

	// Mode: custom (anonymous roles / direct permissions)
	permSet := make(map[string]bool)
	for _, p := range cfg.Permissions {
		if strings.TrimSpace(p) != "" {
			permSet[strings.TrimSpace(p)] = true
		}
	}

	if a.Store != nil {
		for _, roleID := range cfg.Roles {
			r, err := a.Store.GetRole(ctx, roleID)
			if err == nil && r != nil {
				for _, p := range r.Permissions {
					permSet[p] = true
				}
			} else if a.RolesConfig != nil {
				for _, rc := range a.RolesConfig.Roles {
					if rc.ID == roleID {
						for _, p := range rc.Permissions {
							permSet[p] = true
						}
					}
				}
			}
		}
	} else if a.RolesConfig != nil {
		for _, roleID := range cfg.Roles {
			for _, rc := range a.RolesConfig.Roles {
				if rc.ID == roleID {
					for _, p := range rc.Permissions {
						permSet[p] = true
					}
				}
			}
		}
	}

	perms := make([]string, 0, len(permSet))
	for p := range permSet {
		perms = append(perms, p)
	}

	simUser := &models.UserWithPermissions{
		Roles:                cfg.Roles,
		Permissions:          cfg.Permissions,
		EffectivePermissions: perms,
	}
	simUser.EnsureImpliedPermissions()
	if a.RolesConfig != nil && len(cfg.Roles) > 0 {
		denied := a.RolesConfig.DeniedPermissionsForRoles(cfg.Roles)
		simUser.RemovePermissions(denied)
	}
	return simUser, nil
}

func GetUser(ctx context.Context) *models.UserWithPermissions {
	user, ok := ctx.Value(UserContextKey).(*models.UserWithPermissions)
	if !ok {
		return nil
	}
	return user
}

// GetActualUser returns the real authenticated user before any permission simulation was applied.
func GetActualUser(ctx context.Context) *models.UserWithPermissions {
	user := GetUser(ctx)
	if user == nil {
		return nil
	}
	if user.ActualUser != nil {
		return user.ActualUser
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

func RequireAnyPermission(perms ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUser(r.Context())
			if user == nil {
				writeJSONError(w, "Forbidden", http.StatusForbidden)
				return
			}
			for _, perm := range perms {
				if user.HasPermission(perm) {
					next.ServeHTTP(w, r)
					return
				}
			}
			writeJSONError(w, "Forbidden", http.StatusForbidden)
		})
	}
}
