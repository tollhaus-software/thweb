package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
	"github.com/pavolmarko/thweb-backend/internal/kioskcert"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

type Server struct {
	Store                *store.Store
	Authenticator        *auth.Authenticator
	Hub                  *Hub
	KMSProvider          crypto.KMSProvider
	AllergiesKMSProvider crypto.KMSProvider
	KioskGenerator       *kioskcert.Generator
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
	resp := map[string]interface{}{
		"email":                 user.Email,
		"roles":                 user.Roles,
		"permissions":           user.Permissions,
		"effective_permissions": user.EffectivePermissions,
	}
	if user.FamilyID != nil {
		resp["family_id"] = user.FamilyID.String()
	}
	if user.Simulation != nil {
		resp["simulation"] = user.Simulation
	}
	jsonResponse(w, resp)
}

func (s *Server) HandleGetSimulationOptions(w http.ResponseWriter, r *http.Request) {
	actualUser := auth.GetActualUser(r.Context())
	if actualUser == nil || !actualUser.HasPermission("permissions.simulate") {
		http.Error(w, "Forbidden: permissions.simulate required", http.StatusForbidden)
		return
	}

	users, err := s.Store.ListUsers(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list users", http.StatusInternalServerError, err)
		return
	}

	identEmails, err := s.Store.ListIdentifyingEmails(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list identifying emails", http.StatusInternalServerError, err)
		return
	}

	empIdentEmails, err := s.Store.ListEmployeeIdentifyingEmails(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list employee identifying emails", http.StatusInternalServerError, err)
		return
	}

	candidatesMap := make(map[string]*models.SimulationCandidate)

	for _, u := range users {
		norm := models.NormalizeEmail(u.Email)
		cand := &models.SimulationCandidate{
			Email:                norm,
			Source:               "user",
			Roles:                u.Roles,
			Permissions:          u.Permissions,
			EffectivePermissions: u.EffectivePermissions,
		}

		var famIDPtr *uuid.UUID
		if famID, ok := identEmails[norm]; ok {
			famIDPtr = &famID
			cand.FamilyID = &famID
		}
		empTypes := empIdentEmails[norm]
		triggers := s.Authenticator.TriggersForIdentifierEmail(famIDPtr, empTypes)

		if len(triggers) > 0 {
			cand.Source = "both"
			identRoles, implicitPerms := s.Authenticator.RolesAndPermissionsForTriggers(triggers)
			for _, ir := range identRoles {
				found := false
				for _, r := range cand.Roles {
					if r == ir {
						found = true
						break
					}
				}
				if !found {
					cand.Roles = append(cand.Roles, ir)
				}
			}
			permSet := make(map[string]bool)
			for _, p := range cand.EffectivePermissions {
				permSet[p] = true
			}
			for _, p := range implicitPerms {
				permSet[p] = true
			}
			cand.EffectivePermissions = make([]string, 0, len(permSet))
			for p := range permSet {
				cand.EffectivePermissions = append(cand.EffectivePermissions, p)
			}
		}

		// Ensure implied permissions & strip denied
		uModel := &models.UserWithPermissions{
			Roles:                cand.Roles,
			Permissions:          cand.Permissions,
			EffectivePermissions: cand.EffectivePermissions,
		}
		uModel.EnsureImpliedPermissions()
		if s.Authenticator.RolesConfig != nil && len(uModel.Roles) > 0 {
			denied := s.Authenticator.RolesConfig.DeniedPermissionsForRoles(uModel.Roles)
			uModel.RemovePermissions(denied)
		}
		cand.EffectivePermissions = uModel.EffectivePermissions
		candidatesMap[norm] = cand
	}

	// Collect all unique identifier emails (parent and employee)
	allIdentEmails := make(map[string]bool)
	for email := range identEmails {
		allIdentEmails[models.NormalizeEmail(email)] = true
	}
	for email := range empIdentEmails {
		allIdentEmails[models.NormalizeEmail(email)] = true
	}

	for norm := range allIdentEmails {
		if _, exists := candidatesMap[norm]; !exists {
			var famIDPtr *uuid.UUID
			if fid, ok := identEmails[norm]; ok {
				famIDPtr = &fid
			}
			empTypes := empIdentEmails[norm]
			triggers := s.Authenticator.TriggersForIdentifierEmail(famIDPtr, empTypes)
			identRoles, identPerms := s.Authenticator.RolesAndPermissionsForTriggers(triggers)

			uModel := &models.UserWithPermissions{
				Email:                norm,
				Roles:                identRoles,
				Permissions:          identPerms,
				EffectivePermissions: identPerms,
				FamilyID:             famIDPtr,
			}
			uModel.EnsureImpliedPermissions()
			if s.Authenticator.RolesConfig != nil && len(uModel.Roles) > 0 {
				denied := s.Authenticator.RolesConfig.DeniedPermissionsForRoles(uModel.Roles)
				uModel.RemovePermissions(denied)
			}
			candidatesMap[norm] = &models.SimulationCandidate{
				Email:                norm,
				Source:               "identifier_email",
				Roles:                uModel.Roles,
				Permissions:          uModel.Permissions,
				EffectivePermissions: uModel.EffectivePermissions,
				FamilyID:             famIDPtr,
			}
		}
	}

	candidates := make([]models.SimulationCandidate, 0, len(candidatesMap))
	for _, c := range candidatesMap {
		candidates = append(candidates, *c)
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Email < candidates[j].Email
	})

	allRoles, err := s.Store.ListRoles(r.Context())
	if err != nil {
		allRoles = []models.Role{}
	}

	jsonResponse(w, map[string]interface{}{
		"users":       candidates,
		"roles":       allRoles,
		"permissions": models.AllKnownPermissions,
	})
}

func (s *Server) HandleStartSimulation(w http.ResponseWriter, r *http.Request) {
	actualUser := auth.GetActualUser(r.Context())
	if actualUser == nil || !actualUser.HasPermission("permissions.simulate") {
		http.Error(w, "Forbidden: permissions.simulate required", http.StatusForbidden)
		return
	}

	var req models.SimulationConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Mode != "user" && req.Mode != "custom" {
		http.Error(w, "Mode must be 'user' or 'custom'", http.StatusBadRequest)
		return
	}

	if req.Mode == "user" {
		req.UserEmail = models.NormalizeEmail(req.UserEmail)
		if req.UserEmail == "" {
			http.Error(w, "User email is required for user simulation", http.StatusBadRequest)
			return
		}
	}

	req.Active = true

	simUser, err := s.Authenticator.ResolveSimulatedUser(r.Context(), req)
	if err != nil {
		http.Error(w, "Failed to resolve simulation target: "+err.Error(), http.StatusBadRequest)
		return
	}

	cookieBytes, err := json.Marshal(req)
	if err != nil {
		http.Error(w, "Failed to encode simulation cookie: "+err.Error(), http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "thweb_sim",
		Value:    url.QueryEscape(string(cookieBytes)),
		Path:     "/",
		MaxAge:   86400,
		SameSite: http.SameSiteLaxMode,
	})

	intersected := models.IntersectPermissions(actualUser.EffectivePermissions, simUser.EffectivePermissions)

	jsonResponse(w, map[string]interface{}{
		"status":                 "ok",
		"simulation":             req,
		"simulated_roles":        simUser.Roles,
		"simulated_permissions":  simUser.EffectivePermissions,
		"effective_permissions":  intersected,
	})
}

func (s *Server) HandleLeaveSimulation(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	actualUser := auth.GetActualUser(r.Context())
	if (user != nil && user.Simulation != nil && user.Simulation.Active) || (actualUser != nil && actualUser.HasPermission("permissions.simulate")) {
		http.SetCookie(w, &http.Cookie{
			Name:     "thweb_sim",
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			SameSite: http.SameSiteLaxMode,
		})
		jsonResponse(w, map[string]string{"status": "ok"})
		return
	}

	http.Error(w, "Forbidden", http.StatusForbidden)
}

type OverviewChild struct {
	ID                      uuid.UUID                 `json:"id"`
	FirstName               string                    `json:"first_name"`
	FirstNameForAddressList string                    `json:"first_name_for_address_list,omitempty"`
	LastName                string                    `json:"last_name"`
	CurrentGroup            *int                      `json:"current_group,omitempty"`
	IsFormer                bool                      `json:"is_former,omitempty"`
	GroupChanges            []models.ChildGroupChange `json:"group_changes,omitempty"`
}

func computeChildOverviewGroupStatus(changes []models.ChildGroupChange, now time.Time) (*int, bool) {
	if len(changes) == 0 {
		return nil, false
	}
	todayStr := now.Format("2006-01-02")
	var firstEnroll *models.ChildGroupChange
	for i := range changes {
		if changes[i].TargetGroup > 0 {
			firstEnroll = &changes[i]
			break
		}
	}
	if firstEnroll != nil && firstEnroll.ChangeDate.Format("2006-01-02") > todayStr {
		return nil, false
	}

	var effective []models.ChildGroupChange
	for _, c := range changes {
		if c.ChangeDate.Format("2006-01-02") <= todayStr {
			effective = append(effective, c)
		}
	}
	if len(effective) == 0 {
		return nil, false
	}

	latest := effective[len(effective)-1]
	if latest.TargetGroup == 0 {
		return nil, true
	}
	grp := latest.TargetGroup
	return &grp, false
}

type OverviewParent struct {
	ID                      uuid.UUID              `json:"id"`
	FirstName               string                 `json:"first_name"`
	FirstNameForAddressList string                 `json:"first_name_for_address_list,omitempty"`
	LastName                string                 `json:"last_name"`
	Emails                  models.MultiValueList  `json:"emails"`
	Phones                  models.MultiValueList  `json:"phones"`
	Address                 string                 `json:"address"`
	Memberships             *[]models.THMembership `json:"memberships,omitempty"`
}

type OverviewFamily struct {
	ID         uuid.UUID        `json:"id"`
	FamilyName string           `json:"family_name,omitempty"`
	Parents    []OverviewParent `json:"parents"`
	Children   []OverviewChild  `json:"children"`
}

func (s *Server) HandleListFamiliesOverview(w http.ResponseWriter, r *http.Request) {
	families, err := s.Store.ListFamilies(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list families overview", http.StatusInternalServerError, err)
		return
	}

	user := auth.GetUser(r.Context())
	hasSelfService := user != nil && user.HasPermission("families.self.selfservice")
	hasFamiliesAll := user != nil && user.HasPermission("families.all.read")
	now := time.Now()

	overview := make([]OverviewFamily, 0, len(families))
	for _, fam := range families {
		isOwnFamily := user != nil && user.IsSelfFamily(fam.ID)
		canViewGroupChanges := (isOwnFamily && hasSelfService) || hasFamiliesAll
		canViewMemberships := (isOwnFamily && user != nil && user.HasPermission("memberships.self.read")) || (user != nil && user.HasPermission("memberships.all.read"))

		ovParents := make([]OverviewParent, 0, len(fam.Parents))
		for _, p := range fam.Parents {
			var filteredEmails models.MultiValueList
			for _, em := range p.Emails {
				if em.AddressList {
					filteredEmails = append(filteredEmails, em)
				}
			}
			if filteredEmails == nil {
				filteredEmails = models.MultiValueList{}
			}
			var filteredPhones models.MultiValueList
			for _, ph := range p.Phones {
				if ph.AddressList {
					filteredPhones = append(filteredPhones, ph)
				}
			}
			if filteredPhones == nil {
				filteredPhones = models.MultiValueList{}
			}
			var pMemberships *[]models.THMembership
			if canViewMemberships {
				mCopy := p.Memberships
				pMemberships = &mCopy
			}
			displayFirstName := p.FirstName
			if strings.TrimSpace(p.FirstNameForAddressList) != "" {
				displayFirstName = p.FirstNameForAddressList
			}
			ovParents = append(ovParents, OverviewParent{
				ID:                      p.ID,
				FirstName:               displayFirstName,
				FirstNameForAddressList: p.FirstNameForAddressList,
				LastName:                p.LastName,
				Emails:                  filteredEmails,
				Phones:                  filteredPhones,
				Address:                 p.Address,
				Memberships:             pMemberships,
			})
		}

		famChildren := make([]models.Child, len(fam.Children))
		copy(famChildren, fam.Children)
		sort.SliceStable(famChildren, func(i, j int) bool {
			if famChildren[i].BirthDate.Equal(famChildren[j].BirthDate) {
				return famChildren[i].FirstName < famChildren[j].FirstName
			}
			return famChildren[i].BirthDate.Before(famChildren[j].BirthDate)
		})

		ovChildren := make([]OverviewChild, 0, len(famChildren))
		for _, c := range famChildren {
			currGrp, isFormer := computeChildOverviewGroupStatus(c.GroupChanges, now)
			displayFirstName := c.FirstName
			if strings.TrimSpace(c.FirstNameForAddressList) != "" {
				displayFirstName = c.FirstNameForAddressList
			}
			ovc := OverviewChild{
				ID:                      c.ID,
				FirstName:               displayFirstName,
				FirstNameForAddressList: c.FirstNameForAddressList,
				LastName:                c.LastName,
				CurrentGroup:            currGrp,
				IsFormer:                isFormer,
			}
			if canViewGroupChanges {
				ovc.GroupChanges = c.GroupChanges
			}
			ovChildren = append(ovChildren, ovc)
		}

		overview = append(overview, OverviewFamily{
			ID:         fam.ID,
			FamilyName: fam.GetFamilyName(),
			Parents:    ovParents,
			Children:   ovChildren,
		})
	}

	jsonResponse(w, overview)
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
		reqCtx := crypto.NewRequestCipherContext(s.KMSProvider, s.Store, crypto.PurposeVaccination, user.Email, accessToken)
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
	if user == nil || !user.HasPermission("audit.view") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden"})
		return
	}

	filter := models.AuditLogFilter{}

	// Parse search query parameter (e.g. ?q=... or ?search=...)
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		filter.Search = q
	} else if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		filter.Search = search
	}

	// Parse limit parameter (default 50, max 100)
	limitStr := r.URL.Query().Get("limit")
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > 100 {
				l = 100
			}
			filter.Limit = l
		}
	} else {
		filter.Limit = 50
	}

	// Parse before timestamp parameter
	if beforeStr := r.URL.Query().Get("before"); beforeStr != "" {
		if t, err := time.Parse(time.RFC3339Nano, beforeStr); err == nil {
			filter.Before = &t
		} else if t, err := time.Parse(time.RFC3339, beforeStr); err == nil {
			filter.Before = &t
		}
	}

	// Parse before_id parameter
	if beforeIDStr := r.URL.Query().Get("before_id"); beforeIDStr != "" {
		if id, err := uuid.Parse(beforeIDStr); err == nil {
			filter.BeforeID = &id
		}
	}

	logs, hasMore, err := s.Store.QueryAuditLogsForUser(r.Context(), user, filter)
	if err != nil {
		httpErrorLog(w, r, "Failed to list audit logs", http.StatusInternalServerError, err)
		return
	}
	if logs == nil {
		logs = []models.AuditLog{}
	}

	w.Header().Set("X-Has-More", strconv.FormatBool(hasMore))
	if len(logs) > 0 {
		w.Header().Set("X-Next-Before", logs[len(logs)-1].CreatedAt.Format(time.RFC3339Nano))
		w.Header().Set("X-Next-Before-ID", logs[len(logs)-1].ID.String())
	}

	if r.URL.Query().Get("format") == "envelope" {
		resp := map[string]interface{}{
			"logs":     logs,
			"has_more": hasMore,
		}
		if len(logs) > 0 {
			resp["next_before"] = logs[len(logs)-1].CreatedAt.Format(time.RFC3339Nano)
			resp["next_before_id"] = logs[len(logs)-1].ID.String()
		}
		jsonResponse(w, resp)
		return
	}

	jsonResponse(w, logs)
}

func (s *Server) HandleCreateFamily(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	var req struct {
		FirstName               string                `json:"first_name"`
		FirstNameForAddressList string                `json:"first_name_for_address_list"`
		LastName                string                `json:"last_name"`
		Emails                  models.MultiValueList `json:"emails"`
		Phones                  models.MultiValueList `json:"phones"`
		Address                 string                `json:"address"`
		Parents                 []struct {
			FirstName               string                `json:"first_name"`
			FirstNameForAddressList string                `json:"first_name_for_address_list"`
			LastName                string                `json:"last_name"`
			Emails                  models.MultiValueList `json:"emails"`
			Phones                  models.MultiValueList `json:"phones"`
			Address                 string                `json:"address"`
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
				FirstName:               p.FirstName,
				FirstNameForAddressList: p.FirstNameForAddressList,
				LastName:                p.LastName,
				Emails:                  p.Emails,
				Phones:                  p.Phones,
				Address:                 p.Address,
			})
		}
	} else if req.FirstName != "" || req.LastName != "" {
		parents = append(parents, models.Parent{
			FirstName:               req.FirstName,
			FirstNameForAddressList: req.FirstNameForAddressList,
			LastName:                req.LastName,
			Emails:                  req.Emails,
			Phones:                  req.Phones,
			Address:                 req.Address,
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

	// Permission check for identifier emails:
	// Removing or editing an email with identifier_email = true requires families.all.write.
	if user == nil || !user.HasPermission("families.all.write") {
		existingParents, err := s.Store.GetParentsByFamilyID(r.Context(), familyID)
		if err != nil {
			httpErrorLog(w, r, "Failed to load existing parents", http.StatusInternalServerError, err)
			return
		}
		existingParentsMap := make(map[uuid.UUID]models.Parent, len(existingParents))
		for _, ep := range existingParents {
			existingParentsMap[ep.ID] = ep
		}

		// 1. Verify that every existing identifier email is preserved in req.Parents without removal or value changes
		for _, ep := range existingParents {
			var matchingReqParent *models.Parent
			for i := range req.Parents {
				if req.Parents[i].ID == ep.ID {
					matchingReqParent = &req.Parents[i]
					break
				}
			}

			for _, oldEmail := range ep.Emails {
				if !oldEmail.IdentifierEmail {
					continue
				}
				if matchingReqParent == nil {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]string{
						"error": "Forbidden: families.all.write permission required to remove or edit an identifier email",
					})
					return
				}
				found := false
				for _, newEmail := range matchingReqParent.Emails {
					if models.NormalizeEmail(newEmail.Value) == models.NormalizeEmail(oldEmail.Value) && newEmail.IdentifierEmail {
						found = true
						break
					}
				}
				if !found {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]string{
						"error": "Forbidden: families.all.write permission required to remove or edit an identifier email",
					})
					return
				}
			}
		}

		// 2. Verify that no new or non-identifier email in req.Parents has been assigned IdentifierEmail = true
		for _, reqParent := range req.Parents {
			ep, exists := existingParentsMap[reqParent.ID]
			for _, newEmail := range reqParent.Emails {
				if !newEmail.IdentifierEmail {
					continue
				}
				if !exists {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]string{
						"error": "Forbidden: families.all.write permission required to assign an identifier email",
					})
					return
				}
				alreadyIdentifier := false
				for _, oldEmail := range ep.Emails {
					if models.NormalizeEmail(oldEmail.Value) == models.NormalizeEmail(newEmail.Value) && oldEmail.IdentifierEmail {
						alreadyIdentifier = true
						break
					}
				}
				if !alreadyIdentifier {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]string{
						"error": "Forbidden: families.all.write permission required to assign an identifier email",
					})
					return
				}
			}
		}
	}

	if hasChecksToEncrypt && s.KMSProvider != nil && user != nil {
		accessToken := auth.GetAccessToken(r.Context())
		if accessToken == "" {
			httpErrorLog(w, r, "KMS authentication required to save vaccination status", http.StatusUnauthorized, nil)
			return
		}
		reqCtx := crypto.NewRequestCipherContext(s.KMSProvider, s.Store, crypto.PurposeVaccination, user.Email, accessToken)
		defer reqCtx.Close()

		for i := range req.Parents {
			p := &req.Parents[i]
			if len(p.VaccinationChecks) > 0 {
				for cIdx := range p.VaccinationChecks {
					if p.VaccinationChecks[cIdx].EntryCreatedBy == "" {
						p.VaccinationChecks[cIdx].EntryCreatedBy = user.Email
					}
				}
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
		ID                      *uuid.UUID                `json:"id"`
		FamilyID                *uuid.UUID                `json:"family_id"`
		FirstName               string                    `json:"first_name"`
		FirstNameForAddressList string                    `json:"first_name_for_address_list"`
		LastName                string                    `json:"last_name"`
		BirthDate               string                    `json:"birth_date"`
		Notes                   string                    `json:"notes"`
		VaccinationChecks       []models.VaccinationCheck `json:"vaccination_checks"`
		Familiencards           *models.FamiliencardList  `json:"familiencards"`
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
		reqCtx := crypto.NewRequestCipherContext(s.KMSProvider, s.Store, crypto.PurposeVaccination, user.Email, accessToken)
		defer reqCtx.Close()

		for cIdx := range req.VaccinationChecks {
			if req.VaccinationChecks[cIdx].EntryCreatedBy == "" {
				req.VaccinationChecks[cIdx].EntryCreatedBy = user.Email
			}
		}

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

	var familiencards models.FamiliencardList
	if req.Familiencards != nil {
		seen := make(map[int]bool)
		familiencards = make(models.FamiliencardList, 0, len(*req.Familiencards))
		for _, yr := range *req.Familiencards {
			if yr < 1900 || yr > 2100 {
				httpErrorLog(w, r, fmt.Sprintf("Invalid Familiencard year: %d (must be between 1900 and 2100)", yr), http.StatusBadRequest, nil)
				return
			}
			if !seen[yr] {
				seen[yr] = true
				familiencards = append(familiencards, yr)
			}
		}
		sort.Ints(familiencards)
	}

	child := models.Child{
		ID:                         childID,
		FamilyID:                   familyID,
		FirstName:                  req.FirstName,
		FirstNameForAddressList:    req.FirstNameForAddressList,
		LastName:                   req.LastName,
		BirthDate:                  birthDate,
		Notes:                      req.Notes,
		VaccinationStatusProtected: encryptedBlob,
		VaccinationChecks:          req.VaccinationChecks,
		Familiencards:              familiencards,
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
		if errors.Is(err, pgx.ErrNoRows) || strings.Contains(err.Error(), "no rows in result set") || strings.Contains(err.Error(), "not found") {
			httpErrorLog(w, r, "Child group change not found", http.StatusNotFound, err)
			return
		}
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
		if errors.Is(err, pgx.ErrNoRows) || strings.Contains(err.Error(), "no rows in result set") || strings.Contains(err.Error(), "not found") {
			httpErrorLog(w, r, "Child group change not found", http.StatusNotFound, err)
			return
		}
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

func (s *Server) HandleUpdateHygieneEvent(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	eventID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid event ID", http.StatusBadRequest, err)
		return
	}

	var req struct {
		EventDate     string `json:"event_date"`
		EventType     string `json:"event_type"`
		Documentation string `json:"documentation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	if req.EventType != "initial" && req.EventType != "recertify" {
		httpErrorLog(w, r, "Invalid event_type (must be 'initial' or 'recertify')", http.StatusBadRequest, nil)
		return
	}

	eventDate, err := parseFlexibleDate(req.EventDate)
	if err != nil {
		httpErrorLog(w, r, fmt.Sprintf("Invalid event_date format %q", req.EventDate), http.StatusBadRequest, err)
		return
	}

	updated, err := s.Store.UpdateHygieneEvent(r.Context(), user.ID, eventID, eventDate, req.EventType, req.Documentation)
	if err != nil {
		httpErrorLog(w, r, "Failed to update hygiene event", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, updated)
}

func (s *Server) HandleListMembers(w http.ResponseWriter, r *http.Request) {
	members, err := s.Store.ListMembers(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list members", http.StatusInternalServerError, err)
		return
	}
	if members == nil {
		members = []models.MemberRow{}
	}
	jsonResponse(w, members)
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
		if t.Format("2006-01-02") <= startDate.Format("2006-01-02") {
			httpErrorLog(w, r, "End date must be greater than start date", http.StatusBadRequest, nil)
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
		if strings.Contains(err.Error(), "overlap") || strings.Contains(err.Error(), "greater than") {
			httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
			return
		}
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

func (s *Server) HandleUpdateTHMembership(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	membershipID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid membership ID", http.StatusBadRequest, err)
		return
	}

	var req struct {
		StartDate      string  `json:"start_date"`
		EndDate        *string `json:"end_date"`
		MembershipType string  `json:"membership_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	startDate, err := parseFlexibleDate(req.StartDate)
	if err != nil {
		httpErrorLog(w, r, fmt.Sprintf("Invalid start_date format %q", req.StartDate), http.StatusBadRequest, err)
		return
	}

	var endDate *time.Time
	if req.EndDate != nil && strings.TrimSpace(*req.EndDate) != "" {
		t, err := parseFlexibleDate(*req.EndDate)
		if err != nil {
			httpErrorLog(w, r, fmt.Sprintf("Invalid end_date format %q", *req.EndDate), http.StatusBadRequest, err)
			return
		}
		if t.Format("2006-01-02") <= startDate.Format("2006-01-02") {
			httpErrorLog(w, r, "End date must be greater than start date", http.StatusBadRequest, nil)
			return
		}
		endDate = &t
	}

	updated, err := s.Store.UpdateTHMembership(r.Context(), user.ID, membershipID, startDate, endDate, req.MembershipType)
	if err != nil {
		if strings.Contains(err.Error(), "overlap") || strings.Contains(err.Error(), "greater than") {
			httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
			return
		}
		httpErrorLog(w, r, "Failed to update TH membership", http.StatusInternalServerError, err)
		return
	}

	s.Hub.Broadcast(WSMessage{
		Type:    "FAMILY_UPDATED",
		Payload: map[string]string{"id": updated.ParentID.String()},
	})

	jsonResponse(w, updated)
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
		req.Days = 5475
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

func (s *Server) HandleListEmployees(w http.ResponseWriter, r *http.Request) {
	employees, err := s.Store.ListEmployees(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list employees", http.StatusInternalServerError, err)
		return
	}
	if employees == nil {
		employees = []models.Employee{}
	}
	jsonResponse(w, employees)
}

func (s *Server) HandleCreateEmployee(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	var emp models.Employee
	if err := json.NewDecoder(r.Body).Decode(&emp); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}

	created, err := s.Store.CreateEmployee(r.Context(), user.ID, emp)
	if err != nil {
		httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
		return
	}

	if s.Hub != nil {
		s.Hub.Broadcast(WSMessage{
			Type:    "EMPLOYEE_CREATED",
			Payload: map[string]string{"id": created.ID.String()},
		})
	}

	w.WriteHeader(http.StatusCreated)
	jsonResponse(w, created)
}

func (s *Server) HandleUpdateEmployee(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	empID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid employee ID in URL", http.StatusBadRequest, err)
		return
	}

	var emp models.Employee
	if err := json.NewDecoder(r.Body).Decode(&emp); err != nil {
		httpErrorLog(w, r, "Invalid request body JSON", http.StatusBadRequest, err)
		return
	}
	emp.ID = empID

	updated, err := s.Store.UpdateEmployee(r.Context(), user.ID, emp)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			httpErrorLog(w, r, err.Error(), http.StatusNotFound, err)
			return
		}
		httpErrorLog(w, r, err.Error(), http.StatusBadRequest, err)
		return
	}

	if s.Hub != nil {
		s.Hub.Broadcast(WSMessage{
			Type:    "EMPLOYEE_UPDATED",
			Payload: map[string]string{"id": updated.ID.String()},
		})
	}

	jsonResponse(w, updated)
}

func (s *Server) HandleDeleteEmployee(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	idStr := chi.URLParam(r, "id")
	empID, err := uuid.Parse(idStr)
	if err != nil {
		httpErrorLog(w, r, "Invalid employee ID in URL", http.StatusBadRequest, err)
		return
	}

	if err := s.Store.DeleteEmployee(r.Context(), user.ID, empID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			httpErrorLog(w, r, err.Error(), http.StatusNotFound, err)
			return
		}
		httpErrorLog(w, r, "Failed to delete employee", http.StatusInternalServerError, err)
		return
	}

	if s.Hub != nil {
		s.Hub.Broadcast(WSMessage{
			Type:    "EMPLOYEE_DELETED",
			Payload: map[string]string{"id": empID.String()},
		})
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleTestReset(w http.ResponseWriter, r *http.Request) {
	if s.Authenticator == nil || !s.Authenticator.AllowMockAuth {
		httpErrorLog(w, r, "Test reset is only available when mock auth is enabled", http.StatusForbidden, nil)
		return
	}
	if err := s.Store.ResetTestData(r.Context()); err != nil {
		httpErrorLog(w, r, "Failed to reset test data", http.StatusInternalServerError, err)
		return
	}
	if s.Hub != nil {
		s.Hub.Broadcast(WSMessage{
			Type:    "DATA_REFRESH",
			Payload: map[string]string{"action": "reset"},
		})
	}
	jsonResponse(w, map[string]string{"status": "ok", "message": "Test data reset successfully"})
}


