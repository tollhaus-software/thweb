package fees

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestDetermineFeeRelevantData_GroupChanges(t *testing.T) {
	childID := uuid.New()
	child := models.Child{
		ID:        childID,
		FirstName: "Max",
		LastName:  "Mustermann",
		BirthDate: time.Date(2022, 1, 15, 0, 0, 0, 0, time.UTC),
		GroupChanges: []models.ChildGroupChange{
			{
				// 2026 Nov 10: Start in Group 1, counts as full month
				Child:       childID,
				ChangeDate:  time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC),
				TargetGroup: 1,
			},
			{
				// 2027 March 5: move to group 2
				Child:       childID,
				ChangeDate:  time.Date(2027, 3, 5, 0, 0, 0, 0, time.UTC),
				TargetGroup: 2,
			},
			{
				// 2027 Aug 28: move to group 3
				Child:       childID,
				ChangeDate:  time.Date(2027, 8, 28, 0, 0, 0, 0, time.UTC),
				TargetGroup: 3,
			},
			{
				// 2028 Jun 28: exit
				Child:       childID,
				ChangeDate:  time.Date(2028, 6, 28, 0, 0, 0, 0, time.UTC),
				TargetGroup: 0, // Exit
			},
		},
	}

	children := []models.Child{child}

	tests := []struct {
		name       string
		month      time.Time
		wantGroup  int
		wantHalf   bool
		wantInFees bool
	}{
		{
			name:       "Before start date (would be 2026-11-10)",
			month:      time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
			wantInFees: false,
		},
		{
			name:       "Start month 2026 Nov, day < 16, full fee",
			month:      time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
			wantGroup:  1,
			wantHalf:   false,
			wantInFees: true,
		},
		{
			name:       "Following month in group 1",
			month:      time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC),
			wantGroup:  1,
			wantHalf:   false,
			wantInFees: true,
		},
		{
			name:       "Month transitioned to group 2, on 2026-03-05",
			month:      time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC),
			wantGroup:  2,
			wantHalf:   false,
			wantInFees: true,
		},
		{
			name:       "Following month in group 2",
			month:      time.Date(2027, 4, 1, 0, 0, 0, 0, time.UTC),
			wantGroup:  2,
			wantHalf:   false,
			wantInFees: true,
		},
		{
			name:       "Month transitioned to group 3, on 2027-08-28",
			month:      time.Date(2027, 8, 1, 0, 0, 0, 0, time.UTC),
			wantGroup:  3,
			wantHalf:   false,
			wantInFees: true,
		},
		{
			name:       "Following month in group 3",
			month:      time.Date(2027, 9, 1, 0, 0, 0, 0, time.UTC),
			wantGroup:  3,
			wantHalf:   false,
			wantInFees: true,
		},
		{
			name:       "Exit month, on 2028-06-28",
			month:      time.Date(2028, 6, 1, 0, 0, 0, 0, time.UTC),
			wantGroup:  3,
			wantHalf:   false,
			wantInFees: true,
		},
		{
			name:       "Month after exit",
			month:      time.Date(2028, 7, 1, 0, 0, 0, 0, time.UTC),
			wantInFees: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := DetermineFeeRelevantData(children, tt.month)
			ft, ok := data.childrenFeeTypes["Max"]
			if ok != tt.wantInFees {
				t.Fatalf("expected child in fees = %v, got %v", tt.wantInFees, ok)
			}
			if tt.wantInFees {
				if ft.Group != tt.wantGroup {
					t.Errorf("expected group %d, got %d", tt.wantGroup, ft.Group)
				}
				if ft.IsHalf != tt.wantHalf {
					t.Errorf("expected isHalf %v, got %v", tt.wantHalf, ft.IsHalf)
				}
			}
		})
	}
}

func TestDetermineFeeRelevantData_HalfMonthStart(t *testing.T) {
	childID := uuid.New()
	child := models.Child{
		ID:        childID,
		FirstName: "Lisa",
		LastName:  "Mustermann",
		BirthDate: time.Date(2023, 2, 1, 0, 0, 0, 0, time.UTC),
		GroupChanges: []models.ChildGroupChange{
			{
				Child:       childID,
				ChangeDate:  time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC), // day >= 16
				TargetGroup: 1,
			},
		},
	}

	data := DetermineFeeRelevantData([]models.Child{child}, time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC))
	ft, ok := data.childrenFeeTypes["Lisa"]
	if !ok {
		t.Fatalf("expected child in fees")
	}
	if ft.Group != 1 {
		t.Errorf("expected group 1, got %d", ft.Group)
	}
	if !ft.IsHalf {
		t.Errorf("expected isHalf to be true for start date on 20th")
	}

	// In the next month, it should be full
	dataNext := DetermineFeeRelevantData([]models.Child{child}, time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC))
	ftNext, ok := dataNext.childrenFeeTypes["Lisa"]
	if !ok || ftNext.IsHalf {
		t.Errorf("expected full month in December")
	}
}

func TestDetermineFeeRelevantData_Familiencard(t *testing.T) {
	childID := uuid.New()
	child := models.Child{
		ID:            childID,
		FirstName:     "Bart",
		LastName:      "Simpson",
		BirthDate:     time.Date(2020, 4, 1, 0, 0, 0, 0, time.UTC),
		Familiencards: models.FamiliencardList{2026},
		GroupChanges: []models.ChildGroupChange{
			{
				Child:       childID,
				ChangeDate:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
				TargetGroup: 1,
			},
		},
	}

	// Month in 2026: should have Familiencard
	data2026 := DetermineFeeRelevantData([]models.Child{child}, time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC))
	ft2026, ok := data2026.childrenFeeTypes["Bart"]
	if !ok {
		t.Fatalf("expected Bart in fees for 2026")
	}
	if !ft2026.Familiencard {
		t.Errorf("expected Familiencard=true for Bart in 2026")
	}

	// Month in 2027: should NOT have Familiencard
	data2027 := DetermineFeeRelevantData([]models.Child{child}, time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC))
	ft2027, ok := data2027.childrenFeeTypes["Bart"]
	if !ok {
		t.Fatalf("expected Bart in fees for 2027")
	}
	if ft2027.Familiencard {
		t.Errorf("expected Familiencard=false for Bart in 2027")
	}
}

func TestDetermineFee_FamiliencardPerChild(t *testing.T) {
	bartID := uuid.New()
	lisaID := uuid.New()

	bart := models.Child{
		ID:            bartID,
		FirstName:     "Bart",
		LastName:      "Simpson",
		BirthDate:     time.Date(2020, 4, 1, 0, 0, 0, 0, time.UTC),
		Familiencards: models.FamiliencardList{2026},
		GroupChanges: []models.ChildGroupChange{
			{
				Child:       bartID,
				ChangeDate:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
				TargetGroup: 1,
			},
		},
	}
	lisa := models.Child{
		ID:            lisaID,
		FirstName:     "Lisa",
		LastName:      "Simpson",
		BirthDate:     time.Date(2022, 5, 9, 0, 0, 0, 0, time.UTC),
		Familiencards: models.FamiliencardList{}, // No familiencard
		GroupChanges: []models.ChildGroupChange{
			{
				Child:       lisaID,
				ChangeDate:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
				TargetGroup: 1,
			},
		},
	}

	month := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	data := DetermineFeeRelevantData([]models.Child{bart, lisa}, month)

	// Bart has Familiencard, Lisa does not. Household has 2 children.
	// Group 1, 2 children in household:
	// Regular: 209.00 EUR
	// Familiencard: 123.00 EUR
	// Expected total: 209 + 123 = 332.00 EUR
	totalFee, desc := DetermineFee(month, data)
	if totalFee != 332.0 {
		t.Errorf("expected total fee 332.00, got %.2f\nDesc:\n%s", totalFee, desc)
	}
}

func TestDetermineChange_Familiencard(t *testing.T) {
	childID := uuid.New()
	child := models.Child{
		ID:            childID,
		FirstName:     "Bart",
		LastName:      "Simpson",
		BirthDate:     time.Date(2020, 4, 1, 0, 0, 0, 0, time.UTC),
		Familiencards: models.FamiliencardList{2026},
		GroupChanges: []models.ChildGroupChange{
			{
				Child:       childID,
				ChangeDate:  time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
				TargetGroup: 1,
			},
		},
	}

	dataDec2025 := DetermineFeeRelevantData([]models.Child{child}, time.Date(2025, 12, 1, 0, 0, 0, 0, time.UTC))
	dataJan2026 := DetermineFeeRelevantData([]models.Child{child}, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	dataJan2027 := DetermineFeeRelevantData([]models.Child{child}, time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC))

	changeTo2026 := DetermineChange(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), dataDec2025, dataJan2026)
	if changeTo2026 != "Bart: Neue Familiencard" {
		t.Errorf("expected 'Bart: Neue Familiencard', got '%s'", changeTo2026)
	}

	changeTo2027 := DetermineChange(time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), dataJan2026, dataJan2027)
	if changeTo2027 != "Bart: Keine Familiencard mehr" {
		t.Errorf("expected 'Bart: Keine Familiencard mehr', got '%s'", changeTo2027)
	}
}
