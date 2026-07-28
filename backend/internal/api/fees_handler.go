package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/pavolmarko/thweb-backend/internal/fees"
)

func (s *Server) HandleCalculateFees(w http.ResponseWriter, r *http.Request) {
	var req fees.FeeCalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	startT, err := time.Parse("2006-01", req.StartMonth)
	if err != nil {
		http.Error(w, "Invalid start_month format (expected YYYY-MM)", http.StatusBadRequest)
		return
	}

	endT, err := time.Parse("2006-01", req.EndMonth)
	if err != nil {
		http.Error(w, "Invalid end_month format (expected YYYY-MM)", http.StatusBadRequest)
		return
	}

	if endT.Before(startT) {
		http.Error(w, "end_month must be after or equal to start_month", http.StatusBadRequest)
		return
	}

	var months []time.Time
	cur := time.Date(startT.Year(), startT.Month(), 1, 0, 0, 0, 0, time.UTC)
	endLimit := time.Date(endT.Year(), endT.Month(), 1, 0, 0, 0, 0, time.UTC)

	for !cur.After(endLimit) {
		months = append(months, cur)
		cur = cur.AddDate(0, 1, 0)
	}

	familiesList, err := s.Store.ListFamilies(r.Context())
	if err != nil {
		http.Error(w, "Failed to fetch families: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var familyResults []fees.FeeCalculationResult
	var allChanges []fees.FeeChangeResult

	for _, fam := range familiesList {
		familyName := fam.DisplayName()
		mFees, changes := fees.CalculateFamilyFeesForRange(fam.ID, familyName, fam.Children, months)

		familyResults = append(familyResults, fees.FeeCalculationResult{
			FamilyID:    fam.ID,
			FamilyName:  familyName,
			MonthlyFees: mFees,
		})

		allChanges = append(allChanges, changes...)
	}

	jsonResponse(w, map[string]interface{}{
		"family_fees": familyResults,
		"fee_changes": allChanges,
	})
}
