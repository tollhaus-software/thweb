package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/api"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func main() {
	ctx := context.Background()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	if googleClientID == "" {
		log.Fatal("GOOGLE_CLIENT_ID environment variable is required")
	}

	appStore := store.NewStore(pool)
	authenticator := auth.NewAuthenticator(googleClientID, pool)
	hub := api.NewHub()
	go hub.Run()

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

		r.Get("/api/me", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			jsonResponse(w, map[string]string{
				"email": user.Email,
				"role":  user.Role,
			})
		})

		r.Get("/api/families", func(w http.ResponseWriter, r *http.Request) {
			families, err := appStore.ListFamilies(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			jsonResponse(w, families)
		})

		r.Post("/api/families", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			var parent models.Parent
			if err := json.NewDecoder(r.Body).Decode(&parent); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			family, err := appStore.CreateFamilyWithParent(r.Context(), user.ID, parent)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "FAMILY_CREATED",
				"data": family,
			})

			jsonResponse(w, family)
		})

		r.Get("/api/history/{id}", func(w http.ResponseWriter, r *http.Request) {
			idStr := chi.URLParam(r, "id")
			id, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "Invalid ID", http.StatusBadRequest)
				return
			}
			logs, err := appStore.GetHistory(r.Context(), id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			jsonResponse(w, logs)
		})

		r.Put("/api/families/{id}", func(w http.ResponseWriter, r *http.Request) {
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

			err = appStore.UpdateFamilyParents(r.Context(), user.ID, familyID, req.Parents)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "FAMILY_UPDATED",
				"data": map[string]interface{}{
					"id": familyID,
				},
			})

			jsonResponse(w, map[string]string{"status": "success"})
		})

		r.Put("/api/children/{id}", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			idStr := chi.URLParam(r, "id")
			childID, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "Invalid child ID", http.StatusBadRequest)
				return
			}

			var req models.Child
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			err = appStore.UpdateChild(r.Context(), user.ID, childID, req)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "CHILD_UPDATED",
				"data": map[string]interface{}{
					"id": childID,
				},
			})

			jsonResponse(w, map[string]string{"status": "success"})
		})

		r.Delete("/api/families/{id}", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			idStr := chi.URLParam(r, "id")
			familyID, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "Invalid family ID", http.StatusBadRequest)
				return
			}

			err = appStore.DeleteFamily(r.Context(), user.ID, familyID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "FAMILY_DELETED",
				"data": map[string]interface{}{
					"id": familyID,
				},
			})

			jsonResponse(w, map[string]string{"status": "success"})
		})

		r.Delete("/api/children/{id}", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			idStr := chi.URLParam(r, "id")
			childID, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "Invalid child ID", http.StatusBadRequest)
				return
			}

			err = appStore.DeleteChild(r.Context(), user.ID, childID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "CHILD_DELETED",
				"data": map[string]interface{}{
					"id": childID,
				},
			})

			jsonResponse(w, map[string]string{"status": "success"})
		})

		r.Delete("/api/parents/{id}", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			idStr := chi.URLParam(r, "id")
			parentID, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "Invalid parent ID", http.StatusBadRequest)
				return
			}

			err = appStore.DeleteParent(r.Context(), user.ID, parentID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "PARENT_DELETED",
				"data": map[string]interface{}{
					"id": parentID,
				},
			})

			jsonResponse(w, map[string]string{"status": "success"})
		})

		r.Post("/api/hygiene-events", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			var event models.HygieneBelehrungEvent
			if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			if event.ParentID == uuid.Nil {
				http.Error(w, "Parent ID is required", http.StatusBadRequest)
				return
			}
			if event.EventDate.IsZero() {
				http.Error(w, "Event date is required", http.StatusBadRequest)
				return
			}
			if event.EventType != "initial" && event.EventType != "recertify" {
				http.Error(w, "Invalid event type: must be 'initial' or 'recertify'", http.StatusBadRequest)
				return
			}

			createdEvent, err := appStore.CreateHygieneEvent(r.Context(), user.ID, event)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "HYGIENE_EVENT_CREATED",
				"data": createdEvent,
			})

			jsonResponse(w, createdEvent)
		})

		r.Delete("/api/hygiene-events/{id}", func(w http.ResponseWriter, r *http.Request) {
			user := auth.GetUser(r.Context())
			idStr := chi.URLParam(r, "id")
			eventID, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "Invalid event ID", http.StatusBadRequest)
				return
			}

			err = appStore.DeleteHygieneEvent(r.Context(), user.ID, eventID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			hub.Broadcast(map[string]interface{}{
				"type": "HYGIENE_EVENT_DELETED",
				"data": map[string]interface{}{
					"id": eventID,
				},
			})

			jsonResponse(w, map[string]string{"status": "success"})
		})

		r.Post("/api/fees/calculate", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				StartMonth string      `json:"start_month"` // e.g. "2026-01"
				EndMonth   string      `json:"end_month"`   // e.g. "2026-12"
				FamilyIDs  []uuid.UUID `json:"family_ids"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			start, err := time.Parse("2006-01", req.StartMonth)
			if err != nil {
				http.Error(w, "Invalid start_month format, use YYYY-MM", http.StatusBadRequest)
				return
			}
			end, err := time.Parse("2006-01", req.EndMonth)
			if err != nil {
				http.Error(w, "Invalid end_month format, use YYYY-MM", http.StatusBadRequest)
				return
			}

			if start.After(end) {
				http.Error(w, "start_month cannot be after end_month", http.StatusBadRequest)
				return
			}

			// Load all families
			families, err := appStore.ListFamilies(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Build family map for quick lookup
			familyMap := make(map[uuid.UUID]models.Family)
			for _, f := range families {
				familyMap[f.ID] = f
			}

			// Generate months list
			var months []time.Time
			for curr := start; !curr.After(end); curr = curr.AddDate(0, 1, 0) {
				months = append(months, curr)
			}

			familyFees := []FamilyFeeResult{}
			feeChanges := []FeeChangeResult{}

			for _, fid := range req.FamilyIDs {
				f, exists := familyMap[fid]
				if !exists {
					continue
				}

				// Construct family name (joined parents last names)
				var lastNames []string
				for _, p := range f.Parents {
					if p.LastName != "" {
						found := false
						for _, ln := range lastNames {
							if ln == p.LastName {
								found = true
								break
							}
						}
						if !found {
							lastNames = append(lastNames, p.LastName)
						}
					}
				}
				familyName := strings.Join(lastNames, " / ")
				if familyName == "" {
					familyName = "New Family"
				}

				mFees, fChanges := calculateFamilyFeesForRange(f.ID, familyName, f.Children, months)

				familyFees = append(familyFees, FamilyFeeResult{
					FamilyID:    f.ID,
					FamilyName:  familyName,
					MonthlyFees: mFees,
				})

				feeChanges = append(feeChanges, fChanges...)
			}

			jsonResponse(w, map[string]interface{}{
				"family_fees": familyFees,
				"fee_changes": feeChanges,
			})
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON: %v", err)
	}
}

type MonthlyFee struct {
	Month       string  `json:"month"` // e.g. "2026-01"
	Fee         float64 `json:"fee"`
	Description string  `json:"description"`
}

type FeeChangeResult struct {
	FamilyID    uuid.UUID `json:"family_id"`
	FamilyName  string    `json:"family_name"`
	Month       string    `json:"month"` // the month when the new fee is in effect
	PreviousFee float64   `json:"previous_fee"`
	NewFee      float64   `json:"new_fee"`
	Reason      string    `json:"reason"`
}

type FamilyFeeResult struct {
	FamilyID    uuid.UUID    `json:"family_id"`
	FamilyName  string       `json:"family_name"`
	MonthlyFees []MonthlyFee `json:"monthly_fees"`
}

type FeeType struct {
	Group  int
	IsHalf bool
}

type FeeRelevantData struct {
	childrenFeeTypes map[string]FeeType
	childrenUnder18  map[string]struct{}
	familiencard     bool
}

func firstDayOfMonth(d time.Time) time.Time {
	return time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, d.Location())
}

func maybeFirstDayOfMonth(d *time.Time) *time.Time {
	if d == nil {
		return nil
	}
	t := time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, d.Location())
	return &t
}

func determineFeeRelevantData(children []models.Child, month time.Time) FeeRelevantData {
	res := FeeRelevantData{
		childrenFeeTypes: make(map[string]FeeType),
		childrenUnder18:  make(map[string]struct{}),
	}
	firstDayOfNextMonth := month.AddDate(0, 1, 0)

	for _, child := range children {
		// A child must be born before the start of the month to count.
		// If a child turns 18 in this month, it still counts
		if month.After(child.BirthDate) && child.BirthDate.AddDate(18, 0, 0).After(firstDayOfNextMonth) {
			res.childrenUnder18[child.FirstName] = struct{}{}
		}

		if (child.ExitDate != nil && month.After(*child.ExitDate)) {
			continue
		}

		startDate := child.StartDate
		group2StartDate := child.Group2StartDate
		hortStartDate := child.HortStartDate
		startGroup := child.StartGroup

		if startDate == nil && group2StartDate != nil {
			startDate = group2StartDate
			startGroupGroup2 := 2
			startGroup = &startGroupGroup2
		}

		if startDate == nil && hortStartDate != nil {
			startDate = hortStartDate
			startGroupHort := 3
			startGroup = &startGroupHort
		}

		if startDate != nil {
			startMonth := firstDayOfMonth(*startDate)
			hortStartMonth := maybeFirstDayOfMonth(hortStartDate)
			group2StartMonth := maybeFirstDayOfMonth(group2StartDate)

			group := 1
			if startGroup != nil {
				group = *startGroup
			}

			if group2StartMonth != nil && (month.After(*group2StartMonth) || month.Equal(*group2StartMonth)) {
				group = 2
			}

			if hortStartMonth != nil && (month.After(*hortStartMonth) || month.Equal(*hortStartMonth)) {
				group = 3
			}

			if month.Equal(startMonth) {
				if startDate.Day() >= 16 {
					res.childrenFeeTypes[child.FirstName] = FeeType{
			Group:  group,
			IsHalf: true,
		}

				} else {
					res.childrenFeeTypes[child.FirstName] = FeeType{
			Group:  group,
			IsHalf: false,
		}

				}
			} else if month.After(startMonth) {
				res.childrenFeeTypes[child.FirstName] = FeeType{
			Group:  group,
			IsHalf: false,
		}

			}
		}
	}

	return res
}

func formatEur(fee float64) string {
	return fmt.Sprintf("%.2f EUR", fee)
}

func determineFee(month time.Time, data FeeRelevantData) (float64, string) {
	var result float64
	var parts []string

	for child, feeType := range data.childrenFeeTypes {
		fee, descPart := lookupFee(month, len(data.childrenUnder18), feeType, data.familiencard)
		desc := child + " (" + descPart + "): " + formatEur(fee)
		parts = append(parts, desc)

		result += fee
	}

	sort.Strings(parts)
	return result, strings.Join(parts, "\n")
}

func describeFee(ft FeeType) string {
	groupName := ""
	switch ft.Group {
	case 1:
		groupName = "Kleine Gruppe"
	case 2:
		groupName = "Grosse Gruppe"
	case 3:
		groupName = "Hort"
	default:
		groupName = fmt.Sprintf("Gruppe %d", ft.Group)
	}
	halfText := ""
	if ft.IsHalf {
		halfText = " (Halber Monat)"
	}
	return groupName + halfText
}

func determineChange(month time.Time, prevData FeeRelevantData, curData FeeRelevantData) string {
	var parts []string

	if prevData.familiencard && !curData.familiencard {
		parts = append(parts, "Keine Familiencard mehr")
	} else if !prevData.familiencard && curData.familiencard {
		parts = append(parts, "Neue Familiencard")
	}

	allChildren := make(map[string]struct{})
	for child := range prevData.childrenFeeTypes {
		allChildren[child] = struct{}{}
	}
	for child := range curData.childrenFeeTypes {
		allChildren[child] = struct{}{}
	}

	for child := range allChildren {
		prevFeeType, isInPrev := prevData.childrenFeeTypes[child]
		curFeeType, isInCur := curData.childrenFeeTypes[child]

		if !isInPrev && isInCur {
			parts = append(parts, child+": Betreuung startet: "+describeFee(curFeeType))
		}
		if isInPrev && !isInCur {
			parts = append(parts, child+": Betreuung endet")
		}
		if isInPrev && isInCur && prevFeeType != curFeeType {
			parts = append(parts, child+": "+describeFee(prevFeeType)+" -> "+describeFee(curFeeType))
		}
	}

	allChildrenInHaushalt := make(map[string]struct{})
	for child := range prevData.childrenUnder18 {
		allChildrenInHaushalt[child] = struct{}{}
	}
	for child := range curData.childrenUnder18 {
		allChildrenInHaushalt[child] = struct{}{}
	}

	for child := range allChildrenInHaushalt {
		_, isInPrev := prevData.childrenUnder18[child]
		_, isInCur := curData.childrenUnder18[child]
		if !isInPrev && isInCur {
			parts = append(parts, child+": Neu im Haushalt")
		}
		if isInPrev && !isInCur {
			parts = append(parts, child+": Nicht mehr im Haushalt")
		}
	}

	return strings.Join(parts, "\n")
}

var Gr1Regular = [...]float64{264, 209, 187, 165}
var Gr1Familiencard = [...]float64{178, 123, 101, 79}
var Gr2Regular = Gr1Regular
var Gr2Familiencard = [...]float64{205, 150, 128, 106}
var Gr3Regular = [...]float64{170.5, 154, 137.5, 121}
var Gr3Familiencard = [...]float64{163, 147, 130, 114}

var FeesAsOf2025Regular = [][]float64{Gr1Regular[:], Gr2Regular[:], Gr3Regular[:]}
var FeesAsOf2025Familiencard = [][]float64{Gr1Familiencard[:], Gr2Familiencard[:], Gr3Familiencard[:]}

func lookupFee(month time.Time, numChildrenUnder18 int, feeType FeeType, familiencard bool) (float64, string) {
	indexInArray := numChildrenUnder18 - 1
	if indexInArray < 0 {
		indexInArray = 0
	}
	if indexInArray > 3 {
		indexInArray = 3
	}

	groupIndex := feeType.Group - 1
	if groupIndex < 0 {
		groupIndex = 0
	}
	if groupIndex > 2 {
		groupIndex = 2
	}

	var fee float64
	var desc string
	if !familiencard {
		fee = FeesAsOf2025Regular[groupIndex][indexInArray]
		desc = fmt.Sprintf("Gruppe %d, %s im Haushalt", feeType.Group, formatNumChildren(numChildrenUnder18))
	} else {
		fee = FeesAsOf2025Familiencard[groupIndex][indexInArray]
		desc = fmt.Sprintf("Gruppe %d, %s im Haushalt, Familiencard", feeType.Group, formatNumChildren(numChildrenUnder18))
	}

	if (feeType.IsHalf) {
		fee *= 0.5
		desc += ", halber Monat"
	}

	return fee, desc
}

func formatNumChildren(num int) string {
	if num == 1 {
		return "1 Kind"
	}

	return fmt.Sprintf("%d Kinder", num)
}

func calculateFamilyFeesForRange(
	familyID uuid.UUID,
	familyName string,
	children []models.Child,
	months []time.Time,
) ([]MonthlyFee, []FeeChangeResult) {
	monthlyFees := make([]MonthlyFee, len(months))
	changes := []FeeChangeResult{}

	if len(months) == 0 {
		return monthlyFees, changes
	}

	prevMonth := months[0].AddDate(0, -1, 0)
	prevData := determineFeeRelevantData(children, prevMonth)
	prevFeeVal, _ := determineFee(prevMonth, prevData)
	prevFee := &prevFeeVal

	for i, m := range months {
		curData := determineFeeRelevantData(children, m)
		fee, desc := determineFee(m, curData)

		monthlyFees[i] = MonthlyFee{
			Month:       m.Format("2006-01"),
			Fee:         fee,
			Description: desc,
		}

		if prevFee != nil && *prevFee != fee {
			reason := determineChange(m, prevData, curData)
			changes = append(changes, FeeChangeResult{
				FamilyID:    familyID,
				FamilyName:  familyName,
				Month:       m.Format("2006-01"),
				PreviousFee: *prevFee,
				NewFee:      fee,
				Reason:      reason,
			})
		}

		prevData = curData
		currentFee := fee
		prevFee = &currentFee
	}

	return monthlyFees, changes
}
