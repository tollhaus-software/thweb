package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
	"github.com/pavolmarko/thweb-backend/internal/kioskcert"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

type Server struct {
	Store          *store.Store
	Authenticator  *auth.Authenticator
	Hub            *Hub
	KMSProvider    crypto.KMSProvider
	KioskGenerator *kioskcert.Generator
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
		"email":                 user.Email,
		"roles":                 user.Roles,
		"permissions":           user.Permissions,
		"effective_permissions": user.EffectivePermissions,
	})
}

func (s *Server) HandleListFamilies(w http.ResponseWriter, r *http.Request) {
	families, err := s.Store.ListFamilies(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list families", http.StatusInternalServerError, err)
		return
	}

	user := auth.GetUser(r.Context())
	accessToken := auth.GetAccessToken(r.Context())
	if s.KMSProvider != nil && user != nil && accessToken != "" && user.HasPermission("vaccination.status.manage") {
		reqCtx := crypto.NewRequestCipherContext(s.KMSProvider, user.Email, accessToken)
		defer reqCtx.Close()

		hasProtectedRecords := false
		for fIdx := range families {
			for cIdx := range families[fIdx].Children {
				if len(families[fIdx].Children[cIdx].VaccinationStatusProtected) > 0 {
					hasProtectedRecords = true
					break
				}
			}
			if hasProtectedRecords {
				break
			}
			for pIdx := range families[fIdx].Parents {
				if len(families[fIdx].Parents[pIdx].VaccinationStatusProtected) > 0 {
					hasProtectedRecords = true
					break
				}
			}
			if hasProtectedRecords {
				break
			}
		}

		if !hasProtectedRecords {
			if err := s.KMSProvider.ValidateAccess(r.Context(), user.Email, accessToken); err != nil {
				log.Printf("[WARN] User %s has no access to KMS key: %v\n", user.Email, err)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "kms_access_denied",
					"message": "User has no access to the KMS key",
				})
				return
			}
		}

		for fIdx := range families {
			for cIdx := range families[fIdx].Children {
				child := &families[fIdx].Children[cIdx]
				if len(child.VaccinationStatusProtected) > 0 {
					plainJSON, err := reqCtx.Decrypt(r.Context(), child.VaccinationStatusProtected)
					if err != nil {
						log.Printf("[WARN] Failed to decrypt vaccination status for child %s: %v\n", child.ID, err)
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusForbidden)
						json.NewEncoder(w).Encode(map[string]string{
							"error":   "kms_access_denied",
							"message": "User has no access to the KMS key",
						})
						return
					} else if len(plainJSON) > 0 {
						var status models.VaccinationStatusProtected
						if err := json.Unmarshal(plainJSON, &status); err == nil {
							child.VaccinationChecks = status.VaccinationChecks
						} else {
							log.Printf("[WARN] Failed to unmarshal decrypted vaccination status for child %s: %v\n", child.ID, err)
						}
					}
				}
			}

			for pIdx := range families[fIdx].Parents {
				parent := &families[fIdx].Parents[pIdx]
				if len(parent.VaccinationStatusProtected) > 0 {
					plainJSON, err := reqCtx.Decrypt(r.Context(), parent.VaccinationStatusProtected)
					if err != nil {
						log.Printf("[WARN] Failed to decrypt vaccination status for parent %s: %v\n", parent.ID, err)
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusForbidden)
						json.NewEncoder(w).Encode(map[string]string{
							"error":   "kms_access_denied",
							"message": "User has no access to the KMS key",
						})
						return
					} else if len(plainJSON) > 0 {
						var status models.VaccinationStatusProtected
						if err := json.Unmarshal(plainJSON, &status); err == nil {
							parent.VaccinationChecks = status.VaccinationChecks
						} else {
							log.Printf("[WARN] Failed to unmarshal decrypted vaccination status for parent %s: %v\n", parent.ID, err)
						}
					}
				}
			}
		}
	}

	for fIdx := range families {
		for cIdx := range families[fIdx].Children {
			// Clear the encrypted ciphertext blob so it is not exposed in the API response
			families[fIdx].Children[cIdx].VaccinationStatusProtected = nil
		}
		for pIdx := range families[fIdx].Parents {
			families[fIdx].Parents[pIdx].VaccinationStatusProtected = nil
		}
	}

	jsonResponse(w, families)
}

func (s *Server) HandleListAuditLogs(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	if user == nil || !user.HasPermission("audit.all.read") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden"})
		return
	}
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

	hasVaccinationChange := false
	hasChecksToEncrypt := false
	for _, p := range req.Parents {
		if p.VaccinationChecks != nil {
			hasVaccinationChange = true
		}
		if len(p.VaccinationChecks) > 0 {
			hasChecksToEncrypt = true
		}
	}

	if hasVaccinationChange && (user == nil || !user.HasPermission("vaccination.status.manage")) {
		httpErrorLog(w, r, "Forbidden: vaccination.status.manage permission required", http.StatusForbidden, nil)
		return
	}

	if hasChecksToEncrypt && s.KMSProvider != nil && user != nil {
		accessToken := auth.GetAccessToken(r.Context())
		if accessToken == "" {
			httpErrorLog(w, r, "KMS authentication required to save vaccination status", http.StatusUnauthorized, nil)
			return
		}
		reqCtx := crypto.NewRequestCipherContext(s.KMSProvider, user.Email, accessToken)
		defer reqCtx.Close()

		for i := range req.Parents {
			p := &req.Parents[i]
			if len(p.VaccinationChecks) > 0 {
				statusPayload := models.VaccinationStatusProtected{
					VaccinationChecks: p.VaccinationChecks,
				}
				rawJSON, err := json.Marshal(statusPayload)
				if err != nil {
					httpErrorLog(w, r, "Failed to marshal vaccination status JSON", http.StatusBadRequest, err)
					return
				}
				blob, err := reqCtx.Encrypt(r.Context(), rawJSON)
				if err != nil {
					log.Printf("[WARN] Failed to encrypt vaccination status for parent %s: %v\n", p.ID, err)
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]string{
						"error":   "kms_access_denied",
						"message": "User has no access to the KMS key",
					})
					return
				}
				p.VaccinationStatusProtected = blob
			}
		}
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
		ID                *uuid.UUID                `json:"id"`
		FamilyID          *uuid.UUID                `json:"family_id"`
		FirstName         string                    `json:"first_name"`
		LastName          string                    `json:"last_name"`
		BirthDate         string                    `json:"birth_date"`
		Notes             string                    `json:"notes"`
		VaccinationChecks []models.VaccinationCheck `json:"vaccination_checks"`
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

	if req.VaccinationChecks != nil && (user == nil || !user.HasPermission("vaccination.status.manage")) {
		httpErrorLog(w, r, "Forbidden: vaccination.status.manage permission required", http.StatusForbidden, nil)
		return
	}

	var encryptedBlob []byte
	if len(req.VaccinationChecks) > 0 && s.KMSProvider != nil && user != nil {
		accessToken := auth.GetAccessToken(r.Context())
		if accessToken == "" {
			httpErrorLog(w, r, "KMS authentication required to save vaccination status", http.StatusUnauthorized, nil)
			return
		}
		reqCtx := crypto.NewRequestCipherContext(s.KMSProvider, user.Email, accessToken)
		defer reqCtx.Close()

		statusPayload := models.VaccinationStatusProtected{
			VaccinationChecks: req.VaccinationChecks,
		}
		rawJSON, err := json.Marshal(statusPayload)
		if err != nil {
			httpErrorLog(w, r, "Failed to marshal vaccination status JSON", http.StatusBadRequest, err)
			return
		}

		blob, err := reqCtx.Encrypt(r.Context(), rawJSON)
		if err != nil {
			log.Printf("[WARN] Failed to encrypt vaccination status for child %s: %v\n", childID, err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "kms_access_denied",
				"message": "User has no access to the KMS key",
			})
			return
		}
		encryptedBlob = blob
	}

	child := models.Child{
		ID:                         childID,
		FamilyID:                   familyID,
		FirstName:                  req.FirstName,
		LastName:                   req.LastName,
		BirthDate:                  birthDate,
		Notes:                      req.Notes,
		VaccinationStatusProtected: encryptedBlob,
		VaccinationChecks:          req.VaccinationChecks,
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

func (s *Server) HandleCreateChildGroupChange(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	var childID uuid.UUID
	var err error

	var req struct {
		ChildID     *uuid.UUID `json:"child_id"`
		Child       *uuid.UUID `json:"child"`
		ChangeDate  string     `json:"change_date"`
		TargetGroup int        `json:"target_group"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	if idStr != "" {
		childID, err = uuid.Parse(idStr)
		if err != nil {
			httpErrorLog(w, r, "Invalid child ID in URL", http.StatusBadRequest, err)
			return
		}
	} else if req.Child != nil && *req.Child != uuid.Nil {
		childID = *req.Child
	} else if req.ChildID != nil && *req.ChildID != uuid.Nil {
		childID = *req.ChildID
	} else {
		httpErrorLog(w, r, "Missing child ID", http.StatusBadRequest, nil)
		return
	}

	changeDate, err := parseFlexibleDate(req.ChangeDate)
	if err != nil {
		httpErrorLog(w, r, fmt.Sprintf("Invalid change_date format %q", req.ChangeDate), http.StatusBadRequest, err)
		return
	}

	gc := models.ChildGroupChange{
		Child:       childID,
		ChangeDate:  changeDate,
		TargetGroup: req.TargetGroup,
	}

	created, err := s.Store.CreateChildGroupChange(r.Context(), user.ID, gc)
	if err != nil {
		httpErrorLog(w, r, "Failed to create child group change", http.StatusInternalServerError, err)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "CHILD_UPDATED",
		Payload: map[string]string{"id": childID.String()},
	})

	jsonResponse(w, created)
}

func (s *Server) HandleDeleteChildGroupChange(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	changeID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid group change ID", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteChildGroupChange(r.Context(), user.ID, changeID); err != nil {
		httpErrorLog(w, r, "Failed to delete child group change", http.StatusInternalServerError, err)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "CHILD_UPDATED",
		Payload: map[string]string{},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleUpdateChildGroupChange(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	changeID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid group change ID", http.StatusBadRequest, err)
		return
	}

	var req struct {
		ChangeDate  string `json:"change_date"`
		TargetGroup int    `json:"target_group"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	changeDate, err := parseFlexibleDate(req.ChangeDate)
	if err != nil {
		httpErrorLog(w, r, fmt.Sprintf("Invalid change_date format %q", req.ChangeDate), http.StatusBadRequest, err)
		return
	}

	updated, err := s.Store.UpdateChildGroupChange(r.Context(), user.ID, changeID, changeDate, req.TargetGroup)
	if err != nil {
		httpErrorLog(w, r, "Failed to update child group change", http.StatusInternalServerError, err)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "CHILD_UPDATED",
		Payload: map[string]string{"id": updated.Child.String()},
	})

	jsonResponse(w, updated)
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

func (s *Server) HandleGetDailyBrief(w http.ResponseWriter, r *http.Request) {
	dateParam := strings.TrimSpace(r.URL.Query().Get("date"))
	var targetDate time.Time
	if dateParam == "" {
		loc, err := time.LoadLocation("Europe/Berlin")
		var now time.Time
		if err == nil {
			now = time.Now().In(loc)
		} else {
			now = time.Now()
		}
		targetDate = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	} else {
		parsed, err := time.Parse("2006-01-02", dateParam)
		if err != nil {
			httpErrorLog(w, r, "Invalid date format, expected YYYY-MM-DD", http.StatusBadRequest, err)
			return
		}
		targetDate = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
	}

	brief, err := s.Store.GetDailyBrief(r.Context(), targetDate)
	if err != nil {
		httpErrorLog(w, r, "Failed to get daily brief", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, brief)
}

type IssueKioskCertRequest struct {
	DeviceName string `json:"device_name"`
	Password   string `json:"password"`
	Days       int    `json:"days"`
}

func (s *Server) HandleGetKioskCertStatus(w http.ResponseWriter, r *http.Request) {
	hasCA := s.KioskGenerator != nil && s.KioskGenerator.HasCA()
	jsonResponse(w, map[string]interface{}{
		"ca_initialized": hasCA,
	})
}

func (s *Server) HandleIssueKioskCert(w http.ResponseWriter, r *http.Request) {
	if s.KioskGenerator == nil || !s.KioskGenerator.HasCA() {
		httpErrorLog(w, r, "Kiosk CA is not configured or certificates not found on server", http.StatusServiceUnavailable, nil)
		return
	}

	var req IssueKioskCertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	req.DeviceName = strings.TrimSpace(req.DeviceName)
	if req.DeviceName == "" {
		httpErrorLog(w, r, "device_name is required", http.StatusBadRequest, nil)
		return
	}
	if req.Days <= 0 {
		req.Days = 730
	}

	p12Bytes, err := s.KioskGenerator.IssueKioskCert(req.DeviceName, req.Password, req.Days)
	if err != nil {
		httpErrorLog(w, r, "Failed to issue kiosk certificate", http.StatusInternalServerError, err)
		return
	}

	user := auth.GetUser(r.Context())
	actorEmail := "unknown"
	if user != nil {
		actorEmail = user.Email
	}
	log.Printf("[AUDIT] Kiosk certificate issued for device %q by %q (validity: %d days)", req.DeviceName, actorEmail, req.Days)

	filename := fmt.Sprintf("%s.p12", req.DeviceName)
	w.Header().Set("Content-Type", "application/x-pkcs12")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(p12Bytes)))
	w.WriteHeader(http.StatusOK)
	w.Write(p12Bytes)
}


