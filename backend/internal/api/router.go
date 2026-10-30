package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
	"github.com/pavolmarko/thweb-backend/internal/kioskcert"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func SetupRouter(appStore *store.Store, authenticator *auth.Authenticator, hub *Hub, kmsProvider crypto.KMSProvider, allergiesKMSProvider ...crypto.KMSProvider) *chi.Mux {
	var allergiesKMS crypto.KMSProvider
	if len(allergiesKMSProvider) > 0 {
		allergiesKMS = allergiesKMSProvider[0]
	}
	var allergiesCipher *crypto.CachedCipherContext
	if allergiesKMS != nil && appStore != nil {
		allergiesCipher = crypto.NewCachedCipherContext(allergiesKMS, appStore, crypto.PurposeAllergies, crypto.DefaultAllergiesKeyTTL)
	}
	server := &Server{
		Store:                appStore,
		Authenticator:        authenticator,
		Hub:                  hub,
		KMSProvider:          kmsProvider,
		AllergiesKMSProvider: allergiesKMS,
		AllergiesCipher:      allergiesCipher,
		KioskGenerator:       kioskcert.NewGenerator(""),
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Public routes
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	// Test-only endpoints (only enabled when mock auth is active)
	if authenticator.AllowMockAuth {
		r.Post("/api/test/reset", server.HandleTestReset)
		r.Post("/api/test/meal-plan", server.HandleTestSeedMealPlan)
	}

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authenticator.Middleware)

		// WebSocket endpoint (authenticated & origin-checked)
		r.Handle("/ws", hub)
		r.Handle("/api/ws", hub)

		r.Get("/api/me", server.HandleGetMe)
		r.With(auth.RequirePermission("families.all.restrictedread")).Get("/api/families/overview", server.HandleListFamiliesOverview)
		r.With(auth.RequirePermission("families.all.read")).Get("/api/families", server.HandleListFamilies)
		r.With(auth.RequirePermission("audit.view")).Get("/api/audit-logs", server.HandleListAuditLogs)

		// Permissions Simulator
		r.Get("/api/simulation/options", server.HandleGetSimulationOptions)
		r.Post("/api/simulation", server.HandleStartSimulation)
		r.Delete("/api/simulation", server.HandleLeaveSimulation)
		r.Post("/api/simulation/leave", server.HandleLeaveSimulation)

		// Admin - Role Management
		r.Get("/api/admin/roles", server.HandleListRoles)
		r.With(auth.RequirePermission("users.all.manage")).Post("/api/admin/roles", server.HandleCreateRole)
		r.With(auth.RequirePermission("users.all.manage")).Put("/api/admin/roles/{id}", server.HandleUpdateRole)
		r.With(auth.RequirePermission("users.all.manage")).Delete("/api/admin/roles/{id}", server.HandleDeleteRole)

		// Admin - User Management
		r.Get("/api/admin/users", server.HandleListUsers)
		r.With(auth.RequirePermission("users.all.manage")).Post("/api/admin/users", server.HandleCreateUser)
		r.With(auth.RequirePermission("users.all.manage")).Put("/api/admin/users/{id}", server.HandleUpdateUser)
		r.With(auth.RequirePermission("users.all.manage")).Delete("/api/admin/users/{id}", server.HandleDeleteUser)

		// Admin - Kiosk Client Certificate Provisioning
		r.With(auth.RequirePermission("provision.kiosk.cert")).Get("/api/admin/kiosk-certs/status", server.HandleGetKioskCertStatus)
		r.With(auth.RequirePermission("provision.kiosk.cert")).Post("/api/admin/kiosk-certs", server.HandleIssueKioskCert)

		// Family & Child CRUD
		r.With(auth.RequirePermission("families.all.write")).Post("/api/families", server.HandleCreateFamily)
		r.With(auth.RequirePermission("families.all.read")).Put("/api/families/{id}", server.HandleUpdateFamilyParents)
		r.With(auth.RequirePermission("families.all.read")).Post("/api/families/{id}/parents", server.HandleUpdateFamilyParents)
		r.With(auth.RequirePermission("families.all.read")).Put("/api/families/{id}/parents", server.HandleUpdateFamilyParents)
		r.With(auth.RequirePermission("families.all.write")).Delete("/api/families/{id}", server.HandleDeleteFamily)
		r.With(auth.RequirePermission("families.all.write")).Delete("/api/parents/{id}", server.HandleDeleteParent)

		r.With(auth.RequirePermission("children.all.write")).Post("/api/families/{id}/children", server.HandleUpdateChild)
		r.With(auth.RequireAnyPermission("children.all.write", "allergies.children.write")).Put("/api/children/{id}", server.HandleUpdateChild)
		r.With(auth.RequirePermission("children.all.write")).Delete("/api/children/{id}", server.HandleDeleteChild)
		r.With(auth.RequirePermission("children.all.write")).Post("/api/children/{id}/group_changes", server.HandleCreateChildGroupChange)
		r.With(auth.RequirePermission("children.all.write")).Post("/api/children_group_changes", server.HandleCreateChildGroupChange)
		r.With(auth.RequirePermission("children.all.write")).Put("/api/children_group_changes/{id}", server.HandleUpdateChildGroupChange)
		r.With(auth.RequirePermission("children.all.write")).Delete("/api/children_group_changes/{id}", server.HandleDeleteChildGroupChange)

		// Hygiene Belehrung
		r.With(auth.RequirePermission("hygiene.all.write")).Post("/api/hygiene-events", server.HandleCreateHygieneEvent)
		r.With(auth.RequirePermission("hygiene.all.write")).Post("/api/parents/{id}/hygiene-events", server.HandleCreateHygieneEvent)
		r.With(auth.RequirePermission("hygiene.all.write")).Put("/api/hygiene-events/{id}", server.HandleUpdateHygieneEvent)
		r.With(auth.RequirePermission("hygiene.all.write")).Delete("/api/hygiene-events/{id}", server.HandleDeleteHygieneEvent)

		// TH Membership
		r.With(auth.RequirePermission("memberships.all.read")).Get("/api/members", server.HandleListMembers)
		r.With(auth.RequirePermission("memberships.all.write")).Post("/api/memberships", server.HandleCreateTHMembership)
		r.With(auth.RequirePermission("memberships.all.write")).Post("/api/parents/{id}/memberships", server.HandleCreateTHMembership)
		r.With(auth.RequirePermission("memberships.all.write")).Put("/api/memberships/{id}", server.HandleUpdateTHMembership)
		r.With(auth.RequirePermission("memberships.all.write")).Delete("/api/memberships/{id}", server.HandleDeleteTHMembership)

		// Employees CRUD
		r.With(auth.RequireAnyPermission("employees.all.read", "allergies.employees.read")).Get("/api/employees", server.HandleListEmployees)
		r.With(auth.RequirePermission("employees.all.write")).Post("/api/employees", server.HandleCreateEmployee)
		r.With(auth.RequireAnyPermission("employees.all.write", "allergies.employees.write")).Put("/api/employees/{id}", server.HandleUpdateEmployee)
		r.With(auth.RequirePermission("employees.all.write")).Delete("/api/employees/{id}", server.HandleDeleteEmployee)

		// Childcare Fees Calculation
		r.With(auth.RequirePermission("fees.self.read")).Post("/api/fees/calculate", server.HandleCalculateFees)

		// Dashboard / Daily Brief & Allergies Summary
		r.Get("/api/dashboard/daily-brief", server.HandleGetDailyBrief)
		r.With(auth.RequireAnyPermission("allergies.summary.read", "meal_allergens.read")).Get("/api/allergies/summary", server.HandleGetAllergiesSummary)
		r.With(auth.RequireAnyPermission("allergies.summary.read", "meal_allergens.read")).Get("/api/dashboard/allergies", server.HandleGetAllergiesSummary)

		// Meal Allergens (Essen/Allergene)
		r.With(auth.RequirePermission("meal_allergens.read")).Get("/api/meal-allergens", server.HandleListMealAllergens)
		r.With(auth.RequirePermission("meal_allergens.read")).Get("/api/meal-allergens/cooks", server.HandleListMealAllergenCooks)
		r.With(auth.RequirePermission("meal_allergens.read")).Get("/api/meal-allergens/{date}", server.HandleGetMealAllergenDay)
		r.With(auth.RequirePermission("meal_allergens.write")).Put("/api/meal-allergens/{date}", server.HandleUpsertMealAllergens)
		r.With(auth.RequirePermission("meal_allergens.write")).Post("/api/meal-allergens/{date}/finalize", server.HandleFinalizeMealAllergens)
	})

	return r
}
