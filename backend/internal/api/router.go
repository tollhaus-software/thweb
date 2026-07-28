package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func SetupRouter(appStore *store.Store, authenticator *auth.Authenticator, hub *Hub) *chi.Mux {
	server := &Server{
		Store:         appStore,
		Authenticator: authenticator,
		Hub:           hub,
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Public routes
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	r.Handle("/ws", hub)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authenticator.Middleware)

		r.Get("/api/me", server.HandleGetMe)
		r.Get("/api/families", server.HandleListFamilies)
		r.Get("/api/audit-logs", server.HandleListAuditLogs)

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

		// Family & Child CRUD
		r.With(auth.RequirePermission("families.all.write")).Post("/api/families", server.HandleCreateFamily)
		r.With(auth.RequirePermission("families.all.write")).Post("/api/families/{id}/parents", server.HandleUpdateFamilyParents)
		r.With(auth.RequirePermission("families.all.write")).Put("/api/families/{id}/parents", server.HandleUpdateFamilyParents)
		r.With(auth.RequirePermission("families.all.write")).Delete("/api/families/{id}", server.HandleDeleteFamily)
		r.With(auth.RequirePermission("families.all.write")).Delete("/api/parents/{id}", server.HandleDeleteParent)

		r.With(auth.RequirePermission("children.all.write")).Post("/api/families/{id}/children", server.HandleUpdateChild)
		r.With(auth.RequirePermission("children.all.write")).Put("/api/children/{id}", server.HandleUpdateChild)
		r.With(auth.RequirePermission("children.all.write")).Delete("/api/children/{id}", server.HandleDeleteChild)

		// Hygiene Belehrung
		r.With(auth.RequirePermission("hygiene.all.write")).Post("/api/parents/{id}/hygiene-events", server.HandleCreateHygieneEvent)
		r.With(auth.RequirePermission("hygiene.all.write")).Delete("/api/hygiene-events/{id}", server.HandleDeleteHygieneEvent)

		// TH Membership
		r.With(auth.RequirePermission("memberships.all.write")).Post("/api/parents/{id}/memberships", server.HandleCreateTHMembership)
		r.With(auth.RequirePermission("memberships.all.write")).Delete("/api/memberships/{id}", server.HandleDeleteTHMembership)

		// Childcare Fees Calculation
		r.Post("/api/fees/calculate", server.HandleCalculateFees)
	})

	return r
}
