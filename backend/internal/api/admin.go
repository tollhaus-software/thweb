package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

func (s *Server) HandleListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := s.Store.ListRoles(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, roles)
}

func (s *Server) HandleCreateRole(w http.ResponseWriter, r *http.Request) {
	var role models.Role
	if err := json.NewDecoder(r.Body).Decode(&role); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if role.ID == "" {
		http.Error(w, "Role ID is required", http.StatusBadRequest)
		return
	}
	created, err := s.Store.CreateRole(r.Context(), role)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, created)
}

func (s *Server) HandleUpdateRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var role models.Role
	if err := json.NewDecoder(r.Body).Decode(&role); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	role.ID = id
	if err := s.Store.UpdateRole(r.Context(), role); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) HandleDeleteRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.Store.DeleteRole(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.Store.ListUsers(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, users)
}

func (s *Server) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string   `json:"email"`
		Roles       []string `json:"roles"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	rawEmail := strings.TrimSpace(req.Email)
	if rawEmail == "" {
		http.Error(w, "Email is required", http.StatusBadRequest)
		return
	}
	created, err := s.Store.CreateUser(r.Context(), rawEmail, req.Roles, req.Permissions)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, created)
}

func (s *Server) HandleUpdateUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}
	var req struct {
		Roles       []string `json:"roles"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.Store.UpdateUser(r.Context(), id, req.Roles, req.Permissions); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) HandleDeleteUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}
	if err := s.Store.DeleteUser(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleGetActivityStats(w http.ResponseWriter, r *http.Request) {
	days := 7
	if dStr := r.URL.Query().Get("days"); dStr != "" {
		if d, err := strconv.Atoi(dStr); err == nil && d > 0 && d <= 90 {
			days = d
		}
	}
	limit := 200
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 1000 {
			limit = l
		}
	}

	ar := s.ActivityRecorder
	if ar == nil && s.Authenticator != nil {
		ar = s.Authenticator.ActivityRecorder
	}

	stats, err := ar.GetActivityStats(r.Context(), days, limit)
	if err != nil {
		httpErrorLog(w, r, "failed to get activity stats", http.StatusInternalServerError, err)
		return
	}
	jsonResponse(w, stats)
}

func (s *Server) HandleListEmailOutbox(w http.ResponseWriter, r *http.Request) {
	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))
	if statusFilter != "" && statusFilter != "all" && statusFilter != "pending" && statusFilter != "sending" && statusFilter != "sent" && statusFilter != "failed" {
		http.Error(w, "Invalid status filter", http.StatusBadRequest)
		return
	}
	limit := 200
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 500 {
			limit = l
		}
	}
	items, err := s.Store.ListEmailOutbox(r.Context(), statusFilter, limit)
	if err != nil {
		httpErrorLog(w, r, "failed to list email outbox", http.StatusInternalServerError, err)
		return
	}
	jsonResponse(w, items)
}

func (s *Server) HandleEnqueueTestEmail(w http.ResponseWriter, r *http.Request) {
	var req models.EnqueueTestEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	toAddr := strings.TrimSpace(req.ToAddr)
	if toAddr == "" {
		http.Error(w, "Recipient email address (to_addr) is required", http.StatusBadRequest)
		return
	}
	if strings.ContainsAny(toAddr, "\r\n") {
		http.Error(w, "Invalid recipient email address", http.StatusBadRequest)
		return
	}
	parsedAddr, err := mail.ParseAddress(toAddr)
	if err != nil || parsedAddr.Address == "" {
		http.Error(w, "Invalid recipient email address", http.StatusBadRequest)
		return
	}

	subject := strings.TrimSpace(req.Subject)
	if subject == "" {
		subject = "Tollhaus Portal Test-E-Mail"
	}
	if strings.ContainsAny(subject, "\r\n") {
		http.Error(w, "Subject must not contain newline characters", http.StatusBadRequest)
		return
	}

	body := strings.TrimSpace(req.Body)
	if body == "" {
		body = "Dies ist eine Test-E-Mail vom Tollhaus Portal."
	}

	createdBy := getActorEmail(r)
	item, err := s.Store.EnqueueEmail(r.Context(), parsedAddr.Address, subject, body, "test", createdBy)
	if err != nil {
		httpErrorLog(w, r, "failed to enqueue test email", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonResponse(w, item)
}

func (s *Server) HandleRetryEmailOutbox(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid email outbox ID", http.StatusBadRequest)
		return
	}
	item, err := s.Store.RetryEmailOutboxItem(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Email outbox item not found", http.StatusNotFound)
			return
		}
		httpErrorLog(w, r, "failed to retry email outbox item", http.StatusInternalServerError, err)
		return
	}
	jsonResponse(w, item)
}

func (s *Server) HandleDeleteEmailOutbox(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid email outbox ID", http.StatusBadRequest)
		return
	}
	if err := s.Store.DeleteEmailOutboxItem(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Email outbox item not found", http.StatusNotFound)
			return
		}
		httpErrorLog(w, r, "failed to delete email outbox item", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}


