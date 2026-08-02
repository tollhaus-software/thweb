package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
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

func httpErrorLog(w http.ResponseWriter, r *http.Request, msg string, code int, err error) {
	if err != nil {
		log.Printf("[HTTP %d] %s %s error: %s (detail: %v)", code, r.Method, r.URL.Path, msg, err)
	} else {
		log.Printf("[HTTP %d] %s %s error: %s", code, r.Method, r.URL.Path, msg)
	}
	http.Error(w, msg, code)
}

func parseFlexibleDate(dateStr string) (time.Time, error) {
	if dateStr == "" {
		return time.Time{}, errors.New("empty date string")
	}
	formats := []string{
		"2006-01-02",
		time.RFC3339,
		"2006-01-02T15:04:05.999Z07:00",
		"2006-01-02T15:04:05",
	}
	for _, fmtStr := range formats {
		if t, err := time.Parse(fmtStr, dateStr); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unable to parse date %q", dateStr)
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
		httpErrorLog(w, r, "Failed to list families", http.StatusInternalServerError, err)
		return
	}
	jsonResponse(w, families)
}

func (s *Server) HandleListAuditLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := s.Store.ListAuditLogs(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list audit logs", http.StatusInternalServerError, err)
		return
	}
	if logs == nil {
		logs = []models.AuditLog{}
	}
	jsonResponse(w, logs)
}

func (s *Server) HandleCreateFamily(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	var req struct {
		FirstName string   `json:"first_name"`
		LastName  string   `json:"last_name"`
		Emails    []string `json:"emails"`
		Phones    []string `json:"phones"`
		Parents   []struct {
			FirstName string   `json:"first_name"`
			LastName  string   `json:"last_name"`
			Emails    []string `json:"emails"`
			Phones    []string `json:"phones"`
		} `json:"parents"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	var parents []models.Parent
	if len(req.Parents) > 0 {
		for _, p := range req.Parents {
			parents = append(parents, models.Parent{
				FirstName: p.FirstName,
				LastName:  p.LastName,
				Emails:    p.Emails,
				Phones:    p.Phones,
			})
		}
	} else if req.FirstName != "" || req.LastName != "" {
		parents = append(parents, models.Parent{
			FirstName: req.FirstName,
			LastName:  req.LastName,
			Emails:    req.Emails,
			Phones:    req.Phones,
		})
	}

	family, err := s.Store.CreateFamilyWithParents(r.Context(), user.ID, parents)
	if err != nil {
		httpErrorLog(w, r, "Failed to create family with parents", http.StatusInternalServerError, err)
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
		httpErrorLog(w, r, "Invalid family ID", http.StatusBadRequest, err)
		return
	}

	var req struct {
		Parents []models.Parent `json:"parents"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.UpdateFamilyParents(r.Context(), user.ID, familyID, req.Parents); err != nil {
		httpErrorLog(w, r, "Failed to update family parents", http.StatusInternalServerError, err)
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
		httpErrorLog(w, r, "Invalid family ID", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteFamily(r.Context(), user.ID, familyID); err != nil {
		httpErrorLog(w, r, "Failed to delete family", http.StatusInternalServerError, err)
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
		httpErrorLog(w, r, "Invalid ID parameter", http.StatusBadRequest, err)
		return
	}

	var req struct {
		ID              *uuid.UUID `json:"id"`
		FamilyID        *uuid.UUID `json:"family_id"`
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
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	birthDate, err := parseFlexibleDate(req.BirthDate)
	if err != nil {
		httpErrorLog(w, r, fmt.Sprintf("Invalid birth_date format %q", req.BirthDate), http.StatusBadRequest, err)
		return
	}

	var startDate, group2StartDate, hortStartDate, exitDate *time.Time
	if req.StartDate != nil && *req.StartDate != "" {
		t, err := parseFlexibleDate(*req.StartDate)
		if err != nil {
			httpErrorLog(w, r, fmt.Sprintf("Invalid start_date format %q", *req.StartDate), http.StatusBadRequest, err)
			return
		}
		startDate = &t
	}
	if req.Group2StartDate != nil && *req.Group2StartDate != "" {
		t, err := parseFlexibleDate(*req.Group2StartDate)
		if err != nil {
			httpErrorLog(w, r, fmt.Sprintf("Invalid group2_start_date format %q", *req.Group2StartDate), http.StatusBadRequest, err)
			return
		}
		group2StartDate = &t
	}
	if req.HortStartDate != nil && *req.HortStartDate != "" {
		t, err := parseFlexibleDate(*req.HortStartDate)
		if err != nil {
			httpErrorLog(w, r, fmt.Sprintf("Invalid hort_start_date format %q", *req.HortStartDate), http.StatusBadRequest, err)
			return
		}
		hortStartDate = &t
	}
	if req.ExitDate != nil && *req.ExitDate != "" {
		t, err := parseFlexibleDate(*req.ExitDate)
		if err != nil {
			httpErrorLog(w, r, fmt.Sprintf("Invalid exit_date format %q", *req.ExitDate), http.StatusBadRequest, err)
			return
		}
		exitDate = &t
	}

	if req.ID != nil && *req.ID != uuid.Nil {
		childID = *req.ID
		if req.FamilyID != nil && *req.FamilyID != uuid.Nil {
			familyID = *req.FamilyID
		} else {
			familyID = parsedID
		}
	} else {
		childID = parsedID
		if req.FamilyID != nil && *req.FamilyID != uuid.Nil {
			familyID = *req.FamilyID
		} else {
			familyID = parsedID
		}
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
		httpErrorLog(w, r, "Failed to update child in database", http.StatusInternalServerError, err)
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
		httpErrorLog(w, r, "Invalid child ID", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteChild(r.Context(), user.ID, childID); err != nil {
		httpErrorLog(w, r, "Failed to delete child", http.StatusInternalServerError, err)
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
		httpErrorLog(w, r, "Invalid parent ID", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteParent(r.Context(), user.ID, parentID); err != nil {
		httpErrorLog(w, r, "Failed to delete parent", http.StatusInternalServerError, err)
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
	var parentID uuid.UUID
	var err error

	var req struct {
		ParentID      *uuid.UUID `json:"parent_id"`
		EventDate     string     `json:"event_date"`
		EventType     string     `json:"event_type"`
		Documentation string     `json:"documentation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	if idStr != "" {
		parentID, err = uuid.Parse(idStr)
		if err != nil {
			httpErrorLog(w, r, "Invalid parent ID in URL", http.StatusBadRequest, err)
			return
		}
	} else if req.ParentID != nil && *req.ParentID != uuid.Nil {
		parentID = *req.ParentID
	} else {
		httpErrorLog(w, r, "Missing parent_id", http.StatusBadRequest, nil)
		return
	}

	eventDate, err := parseFlexibleDate(req.EventDate)
	if err != nil {
		httpErrorLog(w, r, fmt.Sprintf("Invalid event_date format %q", req.EventDate), http.StatusBadRequest, err)
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
		httpErrorLog(w, r, "Failed to create hygiene event", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, created)
}

func (s *Server) HandleDeleteHygieneEvent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	eventID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid event ID", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteHygieneEvent(r.Context(), user.ID, eventID); err != nil {
		httpErrorLog(w, r, "Failed to delete hygiene event", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleCreateTHMembership(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	var parentID uuid.UUID
	var err error

	var req struct {
		ParentID       *uuid.UUID `json:"parent_id"`
		StartDate      string     `json:"start_date"`
		EndDate        *string    `json:"end_date"`
		MembershipType string     `json:"membership_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	if idStr != "" {
		parentID, err = uuid.Parse(idStr)
		if err != nil {
			httpErrorLog(w, r, "Invalid parent ID in URL", http.StatusBadRequest, err)
			return
		}
	} else if req.ParentID != nil && *req.ParentID != uuid.Nil {
		parentID = *req.ParentID
	} else {
		httpErrorLog(w, r, "Missing parent_id", http.StatusBadRequest, nil)
		return
	}

	startDate, err := parseFlexibleDate(req.StartDate)
	if err != nil {
		httpErrorLog(w, r, fmt.Sprintf("Invalid start_date format %q", req.StartDate), http.StatusBadRequest, err)
		return
	}

	var endDate *time.Time
	if req.EndDate != nil && *req.EndDate != "" {
		t, err := parseFlexibleDate(*req.EndDate)
		if err != nil {
			httpErrorLog(w, r, fmt.Sprintf("Invalid end_date format %q", *req.EndDate), http.StatusBadRequest, err)
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
		httpErrorLog(w, r, "Failed to create TH membership", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, created)
}

func (s *Server) HandleDeleteTHMembership(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	membershipID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid membership ID", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteTHMembership(r.Context(), user.ID, membershipID); err != nil {
		httpErrorLog(w, r, "Failed to delete TH membership", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
