package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

type Server struct {
	Store         *store.Store
	Authenticator *auth.Authenticator
	Hub           *Hub
}

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (s *Server) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	jsonResponse(w, map[string]interface{}{
		"email":                user.Email,
		"roles":                user.Roles,
		"permissions":          user.Permissions,
		"effective_permissions": user.EffectivePermissions,
	})
}

func (s *Server) HandleListFamilies(w http.ResponseWriter, r *http.Request) {
	families, err := s.Store.ListFamilies(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, families)
}

func (s *Server) HandleListAuditLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := s.Store.ListAuditLogs(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, logs)
}

func (s *Server) HandleCreateFamily(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	var req struct {
		Parents []struct {
			FirstName string   `json:"first_name"`
			LastName  string   `json:"last_name"`
			Emails    []string `json:"emails"`
			Phones    []string `json:"phones"`
		} `json:"parents"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var p models.Parent
	if len(req.Parents) > 0 {
		p = models.Parent{
			FirstName: req.Parents[0].FirstName,
			LastName:  req.Parents[0].LastName,
			Emails:    req.Parents[0].Emails,
			Phones:    req.Parents[0].Phones,
		}
	}

	family, err := s.Store.CreateFamilyWithParent(r.Context(), user.ID, p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "FAMILY_CREATED",
		Payload: map[string]string{"id": family.ID.String()},
	})

	jsonResponse(w, family)
}

func (s *Server) HandleUpdateFamilyParents(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	familyID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid family ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Parents []models.Parent `json:"parents"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.Store.UpdateFamilyParents(r.Context(), user.ID, familyID, req.Parents); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "FAMILY_UPDATED",
		Payload: map[string]string{"id": familyID.String()},
	})

	w.WriteHeader(http.StatusOK)
}

func (s *Server) HandleDeleteFamily(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	familyID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid family ID", http.StatusBadRequest)
		return
	}

	if err := s.Store.DeleteFamily(r.Context(), user.ID, familyID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "FAMILY_DELETED",
		Payload: map[string]string{"id": familyID.String()},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleUpdateChild(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	var childID uuid.UUID
	var familyID uuid.UUID

	// May be /api/families/{id}/children or /api/children/{id}
	parsedID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var req struct {
		ID              *uuid.UUID `json:"id"`
		FirstName       string     `json:"first_name"`
		LastName        string     `json:"last_name"`
		BirthDate       string     `json:"birth_date"`
		StartDate       *string    `json:"start_date"`
		Group2StartDate *string    `json:"group2_start_date"`
		HortStartDate   *string    `json:"hort_start_date"`
		ExitDate        *string    `json:"exit_date"`
		StartGroup      *int       `json:"start_group"`
		Notes           string     `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	birthDate, err := time.Parse("2006-01-02", req.BirthDate)
	if err != nil {
		http.Error(w, "Invalid birth_date format", http.StatusBadRequest)
		return
	}

	var startDate, group2StartDate, hortStartDate, exitDate *time.Time
	if req.StartDate != nil && *req.StartDate != "" {
		t, err := time.Parse("2006-01-02", *req.StartDate)
		if err == nil {
			startDate = &t
		}
	}
	if req.Group2StartDate != nil && *req.Group2StartDate != "" {
		t, err := time.Parse("2006-01-02", *req.Group2StartDate)
		if err == nil {
			group2StartDate = &t
		}
	}
	if req.HortStartDate != nil && *req.HortStartDate != "" {
		t, err := time.Parse("2006-01-02", *req.HortStartDate)
		if err == nil {
			hortStartDate = &t
		}
	}
	if req.ExitDate != nil && *req.ExitDate != "" {
		t, err := time.Parse("2006-01-02", *req.ExitDate)
		if err == nil {
			exitDate = &t
		}
	}

	if req.ID != nil && *req.ID != uuid.Nil {
		childID = *req.ID
		familyID = parsedID
	} else {
		childID = parsedID
		familyID = parsedID
	}

	child := models.Child{
		ID:              childID,
		FamilyID:        familyID,
		FirstName:       req.FirstName,
		LastName:        req.LastName,
		BirthDate:       birthDate,
		StartDate:       startDate,
		Group2StartDate: group2StartDate,
		HortStartDate:   hortStartDate,
		ExitDate:        exitDate,
		StartGroup:      req.StartGroup,
		Notes:           req.Notes,
	}

	if err := s.Store.UpdateChild(r.Context(), user.ID, childID, child); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "CHILD_UPDATED",
		Payload: map[string]string{"id": childID.String()},
	})

	w.WriteHeader(http.StatusOK)
}

func (s *Server) HandleDeleteChild(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	childID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid child ID", http.StatusBadRequest)
		return
	}

	if err := s.Store.DeleteChild(r.Context(), user.ID, childID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "CHILD_DELETED",
		Payload: map[string]string{"id": childID.String()},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleDeleteParent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	parentID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid parent ID", http.StatusBadRequest)
		return
	}

	if err := s.Store.DeleteParent(r.Context(), user.ID, parentID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "PARENT_DELETED",
		Payload: map[string]string{"id": parentID.String()},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleCreateHygieneEvent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	parentID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid parent ID", http.StatusBadRequest)
		return
	}

	var req struct {
		EventDate     string `json:"event_date"`
		EventType     string `json:"event_type"`
		Documentation string `json:"documentation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	eventDate, err := time.Parse("2006-01-02", req.EventDate)
	if err != nil {
		http.Error(w, "Invalid event_date format", http.StatusBadRequest)
		return
	}

	event := models.HygieneBelehrungEvent{
		ParentID:      parentID,
		EventDate:     eventDate,
		EventType:     req.EventType,
		Documentation: req.Documentation,
	}

	created, err := s.Store.CreateHygieneEvent(r.Context(), user.ID, event)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, created)
}

func (s *Server) HandleDeleteHygieneEvent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	eventID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid event ID", http.StatusBadRequest)
		return
	}

	if err := s.Store.DeleteHygieneEvent(r.Context(), user.ID, eventID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleCreateTHMembership(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	parentID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid parent ID", http.StatusBadRequest)
		return
	}

	var req struct {
		StartDate      string  `json:"start_date"`
		EndDate        *string `json:"end_date"`
		MembershipType string  `json:"membership_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		http.Error(w, "Invalid start_date format", http.StatusBadRequest)
		return
	}

	var endDate *time.Time
	if req.EndDate != nil && *req.EndDate != "" {
		t, err := time.Parse("2006-01-02", *req.EndDate)
		if err != nil {
			http.Error(w, "Invalid end_date format", http.StatusBadRequest)
			return
		}
		endDate = &t
	}

	membership := models.THMembership{
		ParentID:       parentID,
		StartDate:      startDate,
		EndDate:        endDate,
		MembershipType: req.MembershipType,
	}

	created, err := s.Store.CreateTHMembership(r.Context(), user.ID, membership)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, created)
}

func (s *Server) HandleDeleteTHMembership(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	membershipID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid membership ID", http.StatusBadRequest)
		return
	}

	if err := s.Store.DeleteTHMembership(r.Context(), user.ID, membershipID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
