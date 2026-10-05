package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestRequirePermission_VaccinationStatusManage(t *testing.T) {
	middleware := RequirePermission("vaccination.status.manage")
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	handler := middleware(nextHandler)

	tests := []struct {
		name       string
		user       *models.UserWithPermissions
		wantStatus int
	}{
		{
			name: "allowed with explicit permission",
			user: &models.UserWithPermissions{
				Email:                "mga@example.com",
				EffectivePermissions: []string{"families.all.read", "vaccination.status.manage"},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "allowed with admin wildcard",
			user: &models.UserWithPermissions{
				Email:                "admin@example.com",
				EffectivePermissions: []string{"*"},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "forbidden without permission",
			user: &models.UserWithPermissions{
				Email:                "caregiver@example.com",
				EffectivePermissions: []string{"families.all.read", "children.all.write"},
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "forbidden without user context",
			user:       nil,
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			if tt.user != nil {
				ctx := context.WithValue(req.Context(), UserContextKey, tt.user)
				req = req.WithContext(ctx)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("RequirePermission status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}
