package models

import (
	"encoding/json"
	"testing"
)

func TestUserWithPermissions_HasPermission(t *testing.T) {
	tests := []struct {
		name        string
		effective   []string
		permToCheck string
		want        bool
	}{
		{
			name:        "admin wildcard has vaccination.status.manage",
			effective:   []string{"*"},
			permToCheck: "vaccination.status.manage",
			want:        true,
		},
		{
			name:        "explicit vaccination.status.manage",
			effective:   []string{"families.all.read", "vaccination.status.manage"},
			permToCheck: "vaccination.status.manage",
			want:        true,
		},
		{
			name:        "viewer does not have vaccination.status.manage",
			effective:   []string{"families.all.read", "fees.self.read"},
			permToCheck: "vaccination.status.manage",
			want:        false,
		},
		{
			name:        "empty permissions",
			effective:   []string{},
			permToCheck: "vaccination.status.manage",
			want:        false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			user := &UserWithPermissions{
				EffectivePermissions: tt.effective,
			}
			got := user.HasPermission(tt.permToCheck)
			if got != tt.want {
				t.Errorf("HasPermission(%q) = %v, want %v", tt.permToCheck, got, tt.want)
			}
		})
	}
}

func TestParent_VaccinationJSON(t *testing.T) {
	parent := Parent{
		FirstName: "John",
		LastName:  "Doe",
		VaccinationChecks: []VaccinationCheck{
			{
				VaccinationType: "Masern",
				CheckedBy:       "mga@example.com",
				CheckedOn:       "2026-10-05",
				ProofSeen:       "Impfausweis",
			},
		},
	}

	data, err := json.Marshal(parent)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var parsed Parent
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if len(parsed.VaccinationChecks) != 1 {
		t.Fatalf("Expected 1 vaccination check, got %d", len(parsed.VaccinationChecks))
	}
	if parsed.VaccinationChecks[0].VaccinationType != "Masern" {
		t.Errorf("Expected Masern, got %s", parsed.VaccinationChecks[0].VaccinationType)
	}
}
