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

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "mixed case with dots and spaces",
			input: "  max.Mustermann@tollhaus-stuttgart.de \t\n",
			want:  "max.mustermann@tollhaus-stuttgart.de",
		},
		{
			name:  "all uppercase local and domain with dots",
			input: "MAX.MUSTERMANN@TOLLHAUS-STUTTGART.DE",
			want:  "max.mustermann@tollhaus-stuttgart.de",
		},
		{
			name:  "dots preserved in local-part",
			input: "john.doe.personal@gmail.com",
			want:  "john.doe.personal@gmail.com",
		},
		{
			name:  "already normalized",
			input: "developer@example.com",
			want:  "developer@example.com",
		},
		{
			name:  "empty string",
			input: "   ",
			want:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeEmail(tt.input)
			if got != tt.want {
				t.Errorf("NormalizeEmail(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestMultiValueList_JSONAndSQL(t *testing.T) {
	// 1. Unmarshal string array (legacy format)
	legacyJSON := `["user@example.com", "other@example.com"]`
	var list1 MultiValueList
	if err := json.Unmarshal([]byte(legacyJSON), &list1); err != nil {
		t.Fatalf("failed to unmarshal legacy JSON: %v", err)
	}
	if len(list1) != 2 || list1[0].Value != "user@example.com" || !list1[0].AddressList {
		t.Errorf("unexpected list1: %+v", list1)
	}

	// 2. Unmarshal object array (structured format)
	structuredJSON := `[{"value": "phone1", "address_list": false}, {"value": "phone2", "address_list": true}]`
	var list2 MultiValueList
	if err := json.Unmarshal([]byte(structuredJSON), &list2); err != nil {
		t.Fatalf("failed to unmarshal structured JSON: %v", err)
	}
	if len(list2) != 2 || list2[0].Value != "phone1" || list2[0].AddressList != false || list2[1].AddressList != true {
		t.Errorf("unexpected list2: %+v", list2)
	}

	// 3. SQL driver.Valuer and sql.Scanner roundtrip
	val, err := list2.Value()
	if err != nil {
		t.Fatalf("Value() error: %v", err)
	}
	var list3 MultiValueList
	if err := list3.Scan(val); err != nil {
		t.Fatalf("Scan() error: %v", err)
	}
	if len(list3) != 2 || list3[0].AddressList != false || list3[1].AddressList != true {
		t.Errorf("unexpected list3 after Scan: %+v", list3)
	}
}
