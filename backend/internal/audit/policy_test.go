package audit

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestCanUserViewEntity_Superadmin(t *testing.T) {
	admin := &models.UserWithPermissions{
		Email:                "admin@example.com",
		EffectivePermissions: []string{"*"},
	}

	famID := uuid.New()
	entityTypes := []string{"family", "parent", "child", "child_group_change", "hygiene_event", "th_membership", "unregistered_future_entity"}

	for _, et := range entityTypes {
		if !CanUserViewEntity(admin, et, &famID) {
			t.Errorf("Superadmin should be able to view entity type %q", et)
		}
	}
}

func TestCanUserViewEntity_Caregiver(t *testing.T) {
	famID := uuid.New()
	caregiverWithoutFamiliesAll := &models.UserWithPermissions{
		Email:                "caregiver@example.com",
		EffectivePermissions: []string{"children.all.write", "hygiene.all.write"},
	}

	// Should be able to view child, child_group_change, hygiene_event
	allowed := []string{"child", "child_group_change", "hygiene_event"}
	for _, et := range allowed {
		if !CanUserViewEntity(caregiverWithoutFamiliesAll, et, &famID) {
			t.Errorf("Caregiver should be able to view %q", et)
		}
	}

	// Should NOT be able to view memberships (financial) or family/parent without families.all.read
	forbidden := []string{"th_membership", "family", "parent", "unknown_entity"}
	for _, et := range forbidden {
		if CanUserViewEntity(caregiverWithoutFamiliesAll, et, &famID) {
			t.Errorf("Caregiver should NOT be able to view %q", et)
		}
	}
}

func TestCanUserViewEntity_Treasurer(t *testing.T) {
	famID := uuid.New()
	treasurerWithoutHygiene := &models.UserWithPermissions{
		Email:                "treasurer@example.com",
		EffectivePermissions: []string{"fees.all.read", "memberships.all.write"},
	}

	// Should be able to view memberships
	if !CanUserViewEntity(treasurerWithoutHygiene, "th_membership", &famID) {
		t.Errorf("Treasurer should be able to view th_membership")
	}

	// Should NOT be able to view hygiene_event or children or unknown
	forbidden := []string{"hygiene_event", "child", "child_group_change", "unknown"}
	for _, et := range forbidden {
		if CanUserViewEntity(treasurerWithoutHygiene, et, &famID) {
			t.Errorf("Treasurer should NOT be able to view %q", et)
		}
	}
}

func TestCanUserViewEntity_FamilyScoping(t *testing.T) {
	famA := uuid.New()
	famB := uuid.New()

	selfParent := &models.UserWithPermissions{
		Email:                "parent@example.com",
		FamilyID:             &famA,
		EffectivePermissions: []string{"families.self.selfservice"},
	}

	// Can view own family entities
	if !CanUserViewEntity(selfParent, "parent", &famA) {
		t.Errorf("Self parent should be able to view own family parent")
	}
	if !CanUserViewEntity(selfParent, "child", &famA) {
		t.Errorf("Self parent should be able to view own family child")
	}

	// CANNOT view other family entities
	if CanUserViewEntity(selfParent, "parent", &famB) {
		t.Errorf("Self parent should NOT be able to view other family parent")
	}
	if CanUserViewEntity(selfParent, "child", &famB) {
		t.Errorf("Self parent should NOT be able to view other family child")
	}
}

func TestCanUserViewEntity_FailClosed(t *testing.T) {
	user := &models.UserWithPermissions{
		Email:                "staff@example.com",
		EffectivePermissions: []string{"families.all.read", "fees.all.read", "hygiene.all.write", "memberships.all.write"},
	}

	famID := uuid.New()
	if CanUserViewEntity(user, "unregistered_new_table", &famID) {
		t.Errorf("Unregistered entity types must fail closed and be hidden from non-superadmins")
	}
}

func TestSanitizeSnapshot_Redaction(t *testing.T) {
	famID := uuid.New()
	parentUser := &models.UserWithPermissions{
		Email:                "parent@example.com",
		FamilyID:             &famID,
		EffectivePermissions: []string{"families.self.selfservice"},
	}

	rawParent := map[string]interface{}{
		"id":         uuid.New().String(),
		"first_name": "Erika",
		"last_name":  "Muster",
		"notes":      "Confidential staff assessment notes",
		"emails": []map[string]interface{}{
			{"value": "public@example.com", "address_list": true},
			{"value": "private@example.com", "address_list": false},
		},
		"phones": []map[string]interface{}{
			{"value": "0170-111111", "address_list": true},
			{"value": "0170-999999", "address_list": false},
		},
		"vaccination_checks": []interface{}{
			map[string]interface{}{"status": "immunized"},
		},
	}
	rawJSON, _ := json.Marshal(rawParent)

	sanitizedJSON := SanitizeSnapshot(parentUser, "parent", rawJSON)

	var result map[string]interface{}
	if err := json.Unmarshal(sanitizedJSON, &result); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	// Notes must be redacted
	if notes, _ := result["notes"].(string); notes != "" {
		t.Errorf("Expected notes to be redacted, got: %q", notes)
	}

	// Vaccination fields must be deleted
	if _, ok := result["vaccination_checks"]; ok {
		t.Errorf("Vaccination checks must be stripped")
	}

	// Emails should only contain address_list = true
	emails, _ := result["emails"].([]interface{})
	if len(emails) != 1 {
		t.Fatalf("Expected 1 address_list email, got %d", len(emails))
	}
	emMap := emails[0].(map[string]interface{})
	if emMap["value"] != "public@example.com" {
		t.Errorf("Expected public@example.com, got %v", emMap["value"])
	}

	// Phones should only contain address_list = true
	phones, _ := result["phones"].([]interface{})
	if len(phones) != 1 {
		t.Fatalf("Expected 1 address_list phone, got %d", len(phones))
	}
	phMap := phones[0].(map[string]interface{})
	if phMap["value"] != "0170-111111" {
		t.Errorf("Expected 0170-111111, got %v", phMap["value"])
	}
}

func TestFilterAuditLogsForUser(t *testing.T) {
	famA := uuid.New()
	famB := uuid.New()

	user := &models.UserWithPermissions{
		Email:                "parentA@example.com",
		FamilyID:             &famA,
		EffectivePermissions: []string{"families.self.selfservice"},
	}

	logs := []models.AuditLog{
		{
			ID:         uuid.New(),
			EntityType: "parent",
			FamilyID:   &famA,
			Operation:  "UPDATE",
			BeforeSnapshot: []byte(`{"first_name":"Erika","notes":"secret notes"}`),
			AfterSnapshot:  []byte(`{"first_name":"Erika","notes":"updated secret notes"}`),
		},
		{
			ID:         uuid.New(),
			EntityType: "parent",
			FamilyID:   &famB, // Different family!
			Operation:  "UPDATE",
		},
		{
			ID:         uuid.New(),
			EntityType: "hygiene_event",
			FamilyID:   &famA, // Not permitted for self parent
			Operation:  "INSERT",
		},
	}

	filtered := FilterAuditLogsForUser(user, logs)

	if len(filtered) != 1 {
		t.Fatalf("Expected exactly 1 audit log, got %d", len(filtered))
	}

	var after map[string]interface{}
	json.Unmarshal(filtered[0].AfterSnapshot, &after)
	if after["notes"] != "" {
		t.Errorf("Notes should be scrubbed in filtered log, got %v", after["notes"])
	}
}
