package models

import (
	"encoding/json"
	"testing"
	"time"
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
		{
			name:        "families.all.read implies families.all.restrictedread",
			effective:   []string{"families.all.read"},
			permToCheck: "families.all.restrictedread",
			want:        true,
		},
		{
			name:        "fees.all.read implies fees.self.read",
			effective:   []string{"fees.all.read"},
			permToCheck: "fees.self.read",
			want:        true,
		},
		{
			name:        "employees.all.read directly",
			effective:   []string{"employees.all.read"},
			permToCheck: "employees.all.read",
			want:        true,
		},
		{
			name:        "employees.all.write implies employees.all.read",
			effective:   []string{"employees.all.write"},
			permToCheck: "employees.all.read",
			want:        true,
		},
		{
			name:        "employees.all.read does not imply employees.all.write",
			effective:   []string{"employees.all.read"},
			permToCheck: "employees.all.write",
			want:        false,
		},
		{
			name:        "admin * implies employees.all.read and employees.all.write",
			effective:   []string{"*"},
			permToCheck: "employees.all.write",
			want:        true,
		},
		{
			name:        "memberships.all.write implies memberships.all.read",
			effective:   []string{"memberships.all.write"},
			permToCheck: "memberships.all.read",
			want:        true,
		},
		{
			name:        "memberships.all.write implies memberships.self.read",
			effective:   []string{"memberships.all.write"},
			permToCheck: "memberships.self.read",
			want:        true,
		},
		{
			name:        "memberships.all.read implies memberships.self.read",
			effective:   []string{"memberships.all.read"},
			permToCheck: "memberships.self.read",
			want:        true,
		},
		{
			name:        "memberships.self.read does not imply memberships.all.read",
			effective:   []string{"memberships.self.read"},
			permToCheck: "memberships.all.read",
			want:        false,
		},
		{
			name:        "restricted read does not imply families.all.read",
			effective:   []string{"families.all.restrictedread"},
			permToCheck: "families.all.read",
			want:        false,
		},
		{
			name:        "fees.self.read does not imply fees.all.read",
			effective:   []string{"fees.self.read"},
			permToCheck: "fees.all.read",
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

func TestUserWithPermissions_EnsureImpliedPermissions(t *testing.T) {
	u := &UserWithPermissions{
		EffectivePermissions: []string{"memberships.all.write"},
	}
	u.EnsureImpliedPermissions()

	if !u.HasPermission("memberships.all.read") {
		t.Error("expected memberships.all.write to imply memberships.all.read in EnsureImpliedPermissions")
	}
	if !u.HasPermission("memberships.self.read") {
		t.Error("expected memberships.all.write to imply memberships.self.read in EnsureImpliedPermissions")
	}
}

func TestUserWithPermissions_RemovePermissions(t *testing.T) {
	u := &UserWithPermissions{
		EffectivePermissions: []string{
			"families.all.read",
			"children.all.write",
			"fees.self.read",
			"families.self.selfservice",
		},
	}

	u.RemovePermissions([]string{"fees.self.read"})

	if u.HasPermission("fees.self.read") {
		t.Error("expected fees.self.read to be removed")
	}
	if !u.HasPermission("families.all.read") {
		t.Error("expected families.all.read to still be present")
	}
	if !u.HasPermission("children.all.write") {
		t.Error("expected children.all.write to still be present")
	}
	if !u.HasPermission("families.self.selfservice") {
		t.Error("expected families.self.selfservice to still be present")
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

	// 4. Unmarshal IdentifierEmail with snake_case and camelCase
	emailJSON := `[{"value": "admin@example.com", "identifier_email": true, "address_list": false}, {"value": "parent@example.com", "identifierEmail": true, "addressList": true}]`
	var list4 MultiValueList
	if err := json.Unmarshal([]byte(emailJSON), &list4); err != nil {
		t.Fatalf("failed to unmarshal email JSON: %v", err)
	}
	if len(list4) != 2 {
		t.Fatalf("expected 2 items, got %d", len(list4))
	}
	if !list4[0].IdentifierEmail || list4[0].AddressList {
		t.Errorf("unexpected list4[0]: %+v", list4[0])
	}
	if !list4[1].IdentifierEmail || !list4[1].AddressList {
		t.Errorf("unexpected list4[1]: %+v", list4[1])
	}
}

func TestEmployee_JSONSerialization(t *testing.T) {
	// Test alias unmarshaling (given_name, surname, type, is_child_protection_officer)
	raw := `{
		"given_name": "Maria",
		"surname": "Schmidt",
		"type": "caregiver",
		"is_child_protection_officer": true,
		"address": "Sonnenallee 12",
		"emails": [{"value": "maria@example.com", "identifier_email": true}],
		"phones": [{"value": "123456"}]
	}`

	var emp Employee
	if err := json.Unmarshal([]byte(raw), &emp); err != nil {
		t.Fatalf("failed to unmarshal Employee JSON: %v", err)
	}

	if emp.FirstName != "Maria" || emp.LastName != "Schmidt" {
		t.Errorf("expected Maria Schmidt, got %s %s", emp.FirstName, emp.LastName)
	}
	if emp.EmployeeType != "caregiver" {
		t.Errorf("expected caregiver, got %s", emp.EmployeeType)
	}
	if !emp.IsKinderschutzbeauftragter {
		t.Errorf("expected IsKinderschutzbeauftragter=true")
	}
	if len(emp.Emails) != 1 || !emp.Emails[0].IdentifierEmail {
		t.Errorf("unexpected emails: %+v", emp.Emails)
	}

	// Test marshaling produces both employee_type and type, and both is_kinderschutzbeauftragter and is_child_protection_officer
	data, err := json.Marshal(emp)
	if err != nil {
		t.Fatalf("failed to marshal Employee: %v", err)
	}

	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("failed to unmarshal marshaled employee: %v", err)
	}

	if m["type"] != "caregiver" || m["employee_type"] != "caregiver" {
		t.Errorf("expected type and employee_type to be caregiver, got %+v", m)
	}
	if m["is_kinderschutzbeauftragter"] != true || m["is_child_protection_officer"] != true {
		t.Errorf("expected protection officer flags to be true, got %+v", m)
	}
}

func TestFormatFamilyName(t *testing.T) {
	tests := []struct {
		name     string
		parents  []Parent
		fallback []string
		want     string
	}{
		{
			name:    "empty parents default fallback",
			parents: []Parent{},
			want:    "Familie",
		},
		{
			name:     "empty parents custom fallback",
			parents:  []Parent{},
			fallback: []string{"New Family"},
			want:     "New Family",
		},
		{
			name: "single parent",
			parents: []Parent{
				{FirstName: "Anna", LastName: "Müller"},
			},
			want: "Müller",
		},
		{
			name: "multiple parents same last name deduplicated",
			parents: []Parent{
				{FirstName: "Anna", LastName: "Müller"},
				{FirstName: "Bob", LastName: "Müller"},
			},
			want: "Müller",
		},
		{
			name: "multiple parents alphabetical sorting",
			parents: []Parent{
				{FirstName: "Zachary", LastName: "Zimmermann"},
				{FirstName: "Anna", LastName: "Aalberg"},
				{FirstName: "Bob", LastName: "Müller"},
			},
			want: "Aalberg / Müller / Zimmermann",
		},
		{
			name: "case-insensitive sorting with trimming",
			parents: []Parent{
				{FirstName: "Zachary", LastName: "  smith  "},
				{FirstName: "Anna", LastName: "Adams"},
			},
			want: "Adams / smith",
		},
		{
			name: "parents with empty or whitespace last names ignored",
			parents: []Parent{
				{FirstName: "NoLastName", LastName: "   "},
				{FirstName: "Anna", LastName: "Bauer"},
			},
			want: "Bauer",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := FormatFamilyName(tc.parents, tc.fallback...)
			if got != tc.want {
				t.Errorf("FormatFamilyName() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestMultiValueEntry_Type(t *testing.T) {
	// JSON with type
	jsonStr := `{"value":"0170123456","type":"landline","address_list":true}`
	var entry MultiValueEntry
	if err := json.Unmarshal([]byte(jsonStr), &entry); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if entry.Type != "landline" {
		t.Errorf("expected type 'landline', got %q", entry.Type)
	}

	// Marshaling preserves type
	b, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}
	var roundTrip MultiValueEntry
	if err := json.Unmarshal(b, &roundTrip); err != nil {
		t.Fatalf("failed to unmarshal roundtrip: %v", err)
	}
	if roundTrip.Type != "landline" {
		t.Errorf("expected roundtrip type 'landline', got %q", roundTrip.Type)
	}

	// String unmarshaling defaults Type to empty string
	var strEntry MultiValueEntry
	if err := json.Unmarshal([]byte(`"01511234"`), &strEntry); err != nil {
		t.Fatalf("failed to unmarshal string: %v", err)
	}
	if strEntry.Value != "01511234" {
		t.Errorf("expected value '01511234', got %q", strEntry.Value)
	}
	if strEntry.Type != "" {
		t.Errorf("expected empty type for plain string, got %q", strEntry.Type)
	}
}

func TestCalculateRegularSchoolEnrollment(t *testing.T) {
	intPtr := func(i int) *int { return &i }

	tests := []struct {
		name      string
		birthDate time.Time
		want      *int
	}{
		{
			name:      "zero birth date",
			birthDate: time.Time{},
			want:      nil,
		},
		{
			name:      "sixthBirthday <= 2019, month <= September (May 2016)",
			birthDate: time.Date(2010, 5, 15, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2016),
		},
		{
			name:      "sixthBirthday <= 2019, month <= September (September 2019)",
			birthDate: time.Date(2013, 9, 30, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2019),
		},
		{
			name:      "sixthBirthday <= 2019, month > September (October 2016)",
			birthDate: time.Date(2010, 10, 1, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2017),
		},
		{
			name:      "sixthBirthday <= 2019, month > September (October 2019)",
			birthDate: time.Date(2013, 10, 1, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2020),
		},
		{
			name:      "sixthBirthday == 2020, month <= August (August 2020)",
			birthDate: time.Date(2014, 8, 31, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2020),
		},
		{
			name:      "sixthBirthday == 2020, month > August (September 2020)",
			birthDate: time.Date(2014, 9, 1, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2021),
		},
		{
			name:      "sixthBirthday == 2021, month <= July (July 2021)",
			birthDate: time.Date(2015, 7, 31, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2021),
		},
		{
			name:      "sixthBirthday == 2021, month > July (August 2021)",
			birthDate: time.Date(2015, 8, 1, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2022),
		},
		{
			name:      "sixthBirthday >= 2022, month <= June (June 2022)",
			birthDate: time.Date(2016, 6, 30, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2022),
		},
		{
			name:      "sixthBirthday >= 2022, month > June (July 2022 -> +1 = 2023)",
			birthDate: time.Date(2016, 7, 1, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2023),
		},
		{
			name:      "sixthBirthday >= 2022, month <= June (March 2024)",
			birthDate: time.Date(2018, 3, 15, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2024),
		},
		{
			name:      "sixthBirthday >= 2022, month > June (November 2024 -> +1 = 2025)",
			birthDate: time.Date(2018, 11, 20, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2025),
		},
		{
			name:      "leap year birthdate 2016-02-29 (sixthBirthday 2022-03-01 -> 2022)",
			birthDate: time.Date(2016, 2, 29, 0, 0, 0, 0, time.UTC),
			want:      intPtr(2022),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateRegularSchoolEnrollment(tt.birthDate)
			if (got == nil) != (tt.want == nil) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
			if got != nil && *got != *tt.want {
				t.Errorf("got %d, want %d", *got, *tt.want)
			}
		})
	}
}

func TestChild_SchoolEnrollmentSerialization(t *testing.T) {
	c := Child{
		FirstName: "Max",
		LastName:  "Mustermann",
		BirthDate: time.Date(2018, 11, 20, 0, 0, 0, 0, time.UTC),
	}

	data, err := json.Marshal(c)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if val, ok := m["school_enrollment_default"].(float64); !ok || int(val) != 2025 {
		t.Errorf("expected school_enrollment_default=2025, got %v", m["school_enrollment_default"])
	}
	if _, ok := m["einschulung_regular"]; ok {
		t.Errorf("expected einschulung_regular to not be present")
	}
	if _, ok := m["school_enrollment_regular"]; ok {
		t.Errorf("expected school_enrollment_regular to not be present")
	}
}




