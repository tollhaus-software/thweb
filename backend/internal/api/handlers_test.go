package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestHandleListAuditLogs_Permission(t *testing.T) {
	s := &Server{}

	tests := []struct {
		name       string
		user       *models.UserWithPermissions
		wantStatus int
	}{
		{
			name:       "no user context",
			user:       nil,
			wantStatus: http.StatusForbidden,
		},
		{
			name: "user without audit.all.read",
			user: &models.UserWithPermissions{
				Email:                "developer@example.com",
				EffectivePermissions: []string{"families.all.read", "children.all.write"},
			},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/audit-logs", nil)
			if tt.user != nil {
				ctx := context.WithValue(req.Context(), auth.UserContextKey, tt.user)
				req = req.WithContext(ctx)
			}
			rec := httptest.NewRecorder()

			s.HandleListAuditLogs(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("HandleListAuditLogs status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestHandleGetDailyBrief_InvalidDate(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest("GET", "/api/dashboard/daily-brief?date=invalid-date", nil)
	rec := httptest.NewRecorder()

	s.HandleGetDailyBrief(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("HandleGetDailyBrief with invalid date got status %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

