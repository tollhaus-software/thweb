package fees

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

type FeeCalculationRequest struct {
	StartMonth string `json:"start_month"` // e.g. "2025-01"
	EndMonth   string `json:"end_month"`   // e.g. "2025-12"
}

type FeeCalculationResult struct {
	FamilyID    uuid.UUID      `json:"family_id"`
	FamilyName  string         `json:"family_name"`
	MonthlyFees []MonthlyFee   `json:"monthly_fees"`
}

type MonthlyFee struct {
	Month       string  `json:"month"` // "YYYY-MM"
	Fee         float64 `json:"fee"`
	Description string  `json:"description"`
}

type FeeChangeResult struct {
	FamilyID    uuid.UUID `json:"family_id"`
	FamilyName  string    `json:"family_name"`
	Month       string    `json:"month"` // "YYYY-MM"
	PreviousFee float64   `json:"previous_fee"`
	NewFee      float64   `json:"new_fee"`
	Reason      string    `json:"reason"`
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

func DetermineFeeRelevantData(children []models.Child, month time.Time) FeeRelevantData {
	res := FeeRelevantData{
		childrenFeeTypes: make(map[string]FeeType),
		childrenUnder18:  make(map[string]struct{}),
	}
	firstDayOfNextMonth := month.AddDate(0, 1, 0)

	for _, child := range children {
		if month.After(child.BirthDate) && child.BirthDate.AddDate(18, 0, 0).After(firstDayOfNextMonth) {
			res.childrenUnder18[child.FirstName] = struct{}{}
		}

		if child.ExitDate != nil && month.After(*child.ExitDate) {
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

func DetermineFee(month time.Time, data FeeRelevantData) (float64, string) {
	var result float64
	var parts []string

	for child, feeType := range data.childrenFeeTypes {
		fee, descPart := LookupFee(month, len(data.childrenUnder18), feeType, data.familiencard)
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

func DetermineChange(month time.Time, prevData FeeRelevantData, curData FeeRelevantData) string {
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

func LookupFee(month time.Time, numChildrenUnder18 int, feeType FeeType, familiencard bool) (float64, string) {
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

	if feeType.IsHalf {
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

func CalculateFamilyFeesForRange(
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
	prevData := DetermineFeeRelevantData(children, prevMonth)
	prevFeeVal, _ := DetermineFee(prevMonth, prevData)
	prevFee := &prevFeeVal

	for i, m := range months {
		curData := DetermineFeeRelevantData(children, m)
		fee, desc := DetermineFee(m, curData)

		monthlyFees[i] = MonthlyFee{
			Month:       m.Format("2006-01"),
			Fee:         fee,
			Description: desc,
		}

		if prevFee != nil && *prevFee != fee {
			reason := DetermineChange(m, prevData, curData)
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
