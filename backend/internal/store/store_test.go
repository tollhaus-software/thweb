package store

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestGetDailyBrief(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := NewStore(pool)

	// Clean up any test records
	cleanupDates := []string{"2099-10-08", "2099-10-09", "2099-10-10"}
	defer func() {
		for _, d := range cleanupDates {
			_, _ = pool.Exec(ctx, "DELETE FROM meal_plan_from_sheets WHERE date = $1", d)
			_, _ = pool.Exec(ctx, "DELETE FROM yellow_bag_days WHERE date = $1", d)
		}
	}()

	// 2099-10-09 is a Friday (2099-10-09)
	fridayDate := time.Date(2099, time.October, 9, 0, 0, 0, 0, time.UTC)
	if fridayDate.Weekday() != time.Friday {
		t.Fatalf("expected 2099-10-09 to be Friday, got %v", fridayDate.Weekday())
	}

	// 2099-10-08 is a Thursday
	thursdayDate := time.Date(2099, time.October, 8, 0, 0, 0, 0, time.UTC)

	// Seed yellow_bag_days:
	// Set 2099-10-09 as a yellow bag day.
	// Therefore:
	// - On 2099-10-08 (Thursday): 2099-10-08 + 1 day = 2099-10-09 -> "yellow_bin_put_out"
	// - On 2099-10-09 (Friday): 2099-10-09 is present -> "yellow_bin_retrieve" AND it's Friday -> "clean_coffe_machine"
	now := time.Now()
	_, err = pool.Exec(ctx, `
		INSERT INTO yellow_bag_days (date, fetched_at)
		VALUES ('2099-10-09', $1)
		ON CONFLICT (date) DO UPDATE SET fetched_at = EXCLUDED.fetched_at
	`, now)
	if err != nil {
		t.Fatalf("failed to insert yellow_bag_days: %v", err)
	}

	// Seed meal_plan_from_sheets for 2099-10-09
	_, err = pool.Exec(ctx, `
		INSERT INTO meal_plan_from_sheets (date, fetched_at, cook_name, food_component_1, food_component_2, food_component_3)
		VALUES ('2099-10-09', $1, 'Chef Mario', 'Tomatensuppe', 'Pasta Pesto', 'Apfel')
		ON CONFLICT (date) DO UPDATE SET
			cook_name = EXCLUDED.cook_name,
			food_component_1 = EXCLUDED.food_component_1,
			food_component_2 = EXCLUDED.food_component_2,
			food_component_3 = EXCLUDED.food_component_3
	`, now)
	if err != nil {
		t.Fatalf("failed to insert meal_plan_from_sheets: %v", err)
	}

	// Test 1: Friday 2099-10-09
	briefFriday, err := appStore.GetDailyBrief(ctx, fridayDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed for Friday: %v", err)
	}
	if briefFriday.Date != "2099-10-09" {
		t.Errorf("expected date '2099-10-09', got %q", briefFriday.Date)
	}
	if briefFriday.WhoIsCooking != "Chef Mario" {
		t.Errorf("expected who_is_cooking 'Chef Mario', got %q", briefFriday.WhoIsCooking)
	}
	if len(briefFriday.MealComponents) != 3 {
		t.Errorf("expected 3 meal components, got %d: %+v", len(briefFriday.MealComponents), briefFriday.MealComponents)
	} else {
		if briefFriday.MealComponents[0] != "Tomatensuppe" || briefFriday.MealComponents[1] != "Pasta Pesto" || briefFriday.MealComponents[2] != "Apfel" {
			t.Errorf("unexpected meal components: %+v", briefFriday.MealComponents)
		}
	}

	// Tasks for Friday: yellow_bin_retrieve, clean_coffe_machine, and clean_refrigerator
	hasRetrieve := false
	hasCoffee := false
	hasRefrigerator := false
	for _, task := range briefFriday.TasksAndInfo {
		if task == "yellow_bin_retrieve" {
			hasRetrieve = true
		}
		if task == "clean_coffe_machine" {
			hasCoffee = true
		}
		if task == "clean_refrigerator" {
			hasRefrigerator = true
		}
	}
	if !hasRetrieve {
		t.Errorf("expected 'yellow_bin_retrieve' in tasks, got: %+v", briefFriday.TasksAndInfo)
	}
	if !hasCoffee {
		t.Errorf("expected 'clean_coffe_machine' in tasks, got: %+v", briefFriday.TasksAndInfo)
	}
	if !hasRefrigerator {
		t.Errorf("expected 'clean_refrigerator' in tasks, got: %+v", briefFriday.TasksAndInfo)
	}

	// Test 2: Thursday 2099-10-08
	briefThursday, err := appStore.GetDailyBrief(ctx, thursdayDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed for Thursday: %v", err)
	}
	if briefThursday.Date != "2099-10-08" {
		t.Errorf("expected date '2099-10-08', got %q", briefThursday.Date)
	}
	if briefThursday.WhoIsCooking != "" {
		t.Errorf("expected empty who_is_cooking, got %q", briefThursday.WhoIsCooking)
	}
	if len(briefThursday.MealComponents) != 0 {
		t.Errorf("expected 0 meal components, got %d", len(briefThursday.MealComponents))
	}

	// Tasks for Thursday: yellow_bin_put_out, but NOT clean_coffe_machine, clean_refrigerator, or yellow_bin_retrieve
	hasPutOut := false
	for _, task := range briefThursday.TasksAndInfo {
		if task == "yellow_bin_put_out" {
			hasPutOut = true
		}
		if task == "clean_coffe_machine" || task == "clean_refrigerator" || task == "yellow_bin_retrieve" {
			t.Errorf("unexpected task on Thursday: %s", task)
		}
	}
	if !hasPutOut {
		t.Errorf("expected 'yellow_bin_put_out' in tasks for Thursday, got: %+v", briefThursday.TasksAndInfo)
	}
}

func TestAuditModifications_ExcludesVaccinationStatus(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := NewStore(pool)
	testUserID := uuid.New()

	// Ensure test user exists in users table for FK
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, 'audit-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	// 1. Create family with parent
	parent1 := models.Parent{
		FirstName: "Audited",
		LastName:  "Parent",
		Address:   "Original Address 1",
		Notes:     "Original notes",
		Emails: models.MultiValueList{
			{Value: "audited@example.com", AddressList: true},
		},
		Phones: models.MultiValueList{
			{Value: "+49123456", AddressList: true},
		},
	}
	family, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{parent1})
	if err != nil {
		t.Fatalf("CreateFamilyWithParents failed: %v", err)
	}
	familyID := family.ID
	parentID := family.Parents[0].ID
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, familyID)
	}()

	// Check audit logs for family & parent INSERT
	parentLogs, err := appStore.GetHistory(ctx, parentID)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(parentLogs) != 1 || parentLogs[0].Operation != "INSERT" {
		t.Fatalf("expected 1 INSERT audit log for parent, got: %+v", parentLogs)
	}
	if strings.Contains(string(parentLogs[0].AfterSnapshot), "vaccination") {
		t.Errorf("parent INSERT snapshot should NOT contain vaccination fields: %s", string(parentLogs[0].AfterSnapshot))
	}

	// 2. Modify ONLY vaccination status on parent -> MUST NOT produce an audit log!
	updatedParentOnlyVac := family.Parents[0]
	updatedParentOnlyVac.VaccinationStatusProtected = []byte("encrypted-secret-blob")
	err = appStore.UpdateFamilyParents(ctx, testUserID, familyID, []models.Parent{updatedParentOnlyVac})
	if err != nil {
		t.Fatalf("UpdateFamilyParents failed: %v", err)
	}

	parentLogs, err = appStore.GetHistory(ctx, parentID)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(parentLogs) != 1 {
		t.Fatalf("vaccination-only modification MUST NOT create audit log! expected 1 log, got %d: %+v", len(parentLogs), parentLogs)
	}

	// 3. Modify parent non-vaccination fields (address & notes) along with vaccination status
	updatedParentWithChanges := updatedParentOnlyVac
	updatedParentWithChanges.Address = "New Address 42"
	updatedParentWithChanges.Notes = "Updated notes"
	updatedParentWithChanges.VaccinationStatusProtected = []byte("encrypted-secret-blob-v2")
	err = appStore.UpdateFamilyParents(ctx, testUserID, familyID, []models.Parent{updatedParentWithChanges})
	if err != nil {
		t.Fatalf("UpdateFamilyParents failed: %v", err)
	}

	parentLogs, err = appStore.GetHistory(ctx, parentID)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(parentLogs) != 2 {
		t.Fatalf("expected 2 audit logs for parent (INSERT + UPDATE), got %d", len(parentLogs))
	}
	if parentLogs[0].Operation != "UPDATE" {
		t.Errorf("expected UPDATE operation, got %s", parentLogs[0].Operation)
	}
	if strings.Contains(string(parentLogs[0].BeforeSnapshot), "vaccination") || strings.Contains(string(parentLogs[0].AfterSnapshot), "vaccination") {
		t.Errorf("audit snapshots must NOT leak vaccination data! Before: %s, After: %s", string(parentLogs[0].BeforeSnapshot), string(parentLogs[0].AfterSnapshot))
	}
	if !strings.Contains(string(parentLogs[0].AfterSnapshot), "New Address 42") {
		t.Errorf("expected updated address in after snapshot, got: %s", string(parentLogs[0].AfterSnapshot))
	}

	// 4. Create child
	childID := uuid.New()
	childBirthDate := time.Date(2021, 5, 10, 0, 0, 0, 0, time.UTC)
	child := models.Child{
		ID:        childID,
		FamilyID:  familyID,
		FirstName: "Tommy",
		LastName:  "Audited",
		BirthDate: childBirthDate,
		Notes:     "Original child note",
	}
	err = appStore.UpdateChild(ctx, testUserID, childID, child)
	if err != nil {
		t.Fatalf("UpdateChild create failed: %v", err)
	}

	childLogs, err := appStore.GetHistory(ctx, childID)
	if err != nil {
		t.Fatalf("GetHistory child failed: %v", err)
	}
	if len(childLogs) != 1 || childLogs[0].Operation != "INSERT" {
		t.Fatalf("expected 1 INSERT audit log for child, got: %+v", childLogs)
	}

	// 5. Modify child vaccination status ONLY -> MUST NOT produce audit log!
	childOnlyVac := child
	childOnlyVac.VaccinationStatusProtected = []byte("child-secret-blob")
	err = appStore.UpdateChild(ctx, testUserID, childID, childOnlyVac)
	if err != nil {
		t.Fatalf("UpdateChild vac only failed: %v", err)
	}

	childLogs, err = appStore.GetHistory(ctx, childID)
	if err != nil {
		t.Fatalf("GetHistory child failed: %v", err)
	}
	if len(childLogs) != 1 {
		t.Fatalf("child vaccination-only modification MUST NOT create audit log! expected 1 log, got %d: %+v", len(childLogs), childLogs)
	}

	// 6. Modify child non-vaccination fields (notes)
	childWithChanges := childOnlyVac
	childWithChanges.Notes = "Updated child note"
	err = appStore.UpdateChild(ctx, testUserID, childID, childWithChanges)
	if err != nil {
		t.Fatalf("UpdateChild notes failed: %v", err)
	}

	childLogs, err = appStore.GetHistory(ctx, childID)
	if err != nil {
		t.Fatalf("GetHistory child failed: %v", err)
	}
	if len(childLogs) != 2 || childLogs[0].Operation != "UPDATE" {
		t.Fatalf("expected 2 audit logs for child (INSERT + UPDATE), got: %+v", childLogs)
	}
	if strings.Contains(string(childLogs[0].BeforeSnapshot), "vaccination") || strings.Contains(string(childLogs[0].AfterSnapshot), "vaccination") {
		t.Errorf("child audit snapshots must NOT leak vaccination data! Before: %s, After: %s", string(childLogs[0].BeforeSnapshot), string(childLogs[0].AfterSnapshot))
	}

	// 7. Child Group Change modifications
	gcDate := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	gc, err := appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{
		Child:       childID,
		ChangeDate:  gcDate,
		TargetGroup: 1,
	})
	if err != nil {
		t.Fatalf("CreateChildGroupChange failed: %v", err)
	}
	gcLogs, err := appStore.GetHistory(ctx, gc.ID)
	if err != nil {
		t.Fatalf("GetHistory gc failed: %v", err)
	}
	if len(gcLogs) != 1 || gcLogs[0].Operation != "INSERT" {
		t.Fatalf("expected 1 INSERT log for group change, got: %+v", gcLogs)
	}

	// Update child group change
	updatedGCDate := time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC)
	_, err = appStore.UpdateChildGroupChange(ctx, testUserID, gc.ID, updatedGCDate, 2)
	if err != nil {
		t.Fatalf("UpdateChildGroupChange failed: %v", err)
	}
	gcLogs, err = appStore.GetHistory(ctx, gc.ID)
	if err != nil {
		t.Fatalf("GetHistory gc after update failed: %v", err)
	}
	if len(gcLogs) != 2 || gcLogs[0].Operation != "UPDATE" {
		t.Fatalf("expected 2 logs for group change (INSERT + UPDATE), got: %+v", gcLogs)
	}

	// 8. Hygiene Event modifications
	eventDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	he, err := appStore.CreateHygieneEvent(ctx, testUserID, models.HygieneBelehrungEvent{
		ParentID:      parentID,
		EventDate:     eventDate,
		EventType:     "initial",
		Documentation: "Original doc",
	})
	if err != nil {
		t.Fatalf("CreateHygieneEvent failed: %v", err)
	}
	heLogs, err := appStore.GetHistory(ctx, he.ID)
	if err != nil {
		t.Fatalf("GetHistory hygiene event failed: %v", err)
	}
	if len(heLogs) != 1 || heLogs[0].Operation != "INSERT" {
		t.Fatalf("expected 1 INSERT log for hygiene event, got: %+v", heLogs)
	}

	// Update hygiene event
	_, err = appStore.UpdateHygieneEvent(ctx, testUserID, he.ID, eventDate.AddDate(1, 0, 0), "recertify", "Updated doc")
	if err != nil {
		t.Fatalf("UpdateHygieneEvent failed: %v", err)
	}
	heLogs, err = appStore.GetHistory(ctx, he.ID)
	if err != nil {
		t.Fatalf("GetHistory hygiene event after update failed: %v", err)
	}
	if len(heLogs) != 2 || heLogs[0].Operation != "UPDATE" {
		t.Fatalf("expected 2 logs for hygiene event (INSERT + UPDATE), got: %+v", heLogs)
	}

	// 9. Membership modifications
	memStartDate := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	mem, err := appStore.CreateTHMembership(ctx, testUserID, models.THMembership{
		ParentID:       parentID,
		StartDate:      memStartDate,
		MembershipType: "full_member",
	})
	if err != nil {
		t.Fatalf("CreateTHMembership failed: %v", err)
	}
	memLogs, err := appStore.GetHistory(ctx, mem.ID)
	if err != nil {
		t.Fatalf("GetHistory membership failed: %v", err)
	}
	if len(memLogs) != 1 || memLogs[0].Operation != "INSERT" {
		t.Fatalf("expected 1 INSERT log for membership, got: %+v", memLogs)
	}

	// Update membership
	memEndDate := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	_, err = appStore.UpdateTHMembership(ctx, testUserID, mem.ID, memStartDate, &memEndDate, "supporting_member")
	if err != nil {
		t.Fatalf("UpdateTHMembership failed: %v", err)
	}
	memLogs, err = appStore.GetHistory(ctx, mem.ID)
	if err != nil {
		t.Fatalf("GetHistory membership after update failed: %v", err)
	}
	if len(memLogs) != 2 || memLogs[0].Operation != "UPDATE" {
		t.Fatalf("expected 2 logs for membership (INSERT + UPDATE), got: %+v", memLogs)
	}
}

func TestListAuditLogsForUser_PermissionsAndVisibility(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := NewStore(pool)
	if err := appStore.ResetTestData(ctx); err != nil {
		t.Fatalf("ResetTestData failed: %v", err)
	}

	testUserID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, 'audit-perm-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	// Create Family 1
	fam1Parents := []models.Parent{
		{
			FirstName: "Erika",
			LastName:  "Mustermann",
			Notes:     "Confidential staff evaluation note",
			Emails: models.MultiValueList{
				{Value: "erika@example.com", AddressList: true},
				{Value: "erika.private@example.com", AddressList: false},
			},
		},
	}
	fam1, err := appStore.CreateFamilyWithParents(ctx, testUserID, fam1Parents)
	if err != nil {
		t.Fatalf("CreateFamilyWithParents failed: %v", err)
	}
	fam1ParentID := fam1.Parents[0].ID

	// Create Child in Family 1
	childID := uuid.New()
	childBirth := time.Date(2022, 5, 10, 0, 0, 0, 0, time.UTC)
	err = appStore.UpdateChild(ctx, testUserID, childID, models.Child{
		ID:        childID,
		FamilyID:  fam1.ID,
		FirstName: "Max",
		LastName:  "Mustermann",
		BirthDate: childBirth,
		Notes:     "Special care note",
	})
	if err != nil {
		t.Fatalf("UpdateChild failed: %v", err)
	}

	// Create Child Group Change in Family 1
	gcDate := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	_, err = appStore.CreateChildGroupChange(ctx, testUserID, models.ChildGroupChange{
		Child:       childID,
		ChangeDate:  gcDate,
		TargetGroup: 2,
	})
	if err != nil {
		t.Fatalf("CreateChildGroupChange failed: %v", err)
	}

	// Create Hygiene Event in Family 1
	heDate := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	_, err = appStore.CreateHygieneEvent(ctx, testUserID, models.HygieneBelehrungEvent{
		ParentID:      fam1ParentID,
		EventDate:     heDate,
		EventType:     "initial",
		Documentation: "Documented",
	})
	if err != nil {
		t.Fatalf("CreateHygieneEvent failed: %v", err)
	}

	// Create Membership in Family 1
	memStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	_, err = appStore.CreateTHMembership(ctx, testUserID, models.THMembership{
		ParentID:       fam1ParentID,
		StartDate:      memStart,
		MembershipType: "full_member",
	})
	if err != nil {
		t.Fatalf("CreateTHMembership failed: %v", err)
	}

	// Create Family 2
	fam2Parents := []models.Parent{
		{
			FirstName: "Hans",
			LastName:  "Schmidt",
			Notes:     "Schmidt note",
		},
	}
	fam2, err := appStore.CreateFamilyWithParents(ctx, testUserID, fam2Parents)
	if err != nil {
		t.Fatalf("CreateFamilyWithParents 2 failed: %v", err)
	}

	// 1. Superadmin User: sees all logs from both families
	adminUser := &models.UserWithPermissions{
		Email:                "admin@example.com",
		EffectivePermissions: []string{"*"},
	}
	adminLogs, err := appStore.ListAuditLogsForUser(ctx, adminUser)
	if err != nil {
		t.Fatalf("ListAuditLogsForUser admin failed: %v", err)
	}
	if len(adminLogs) == 0 {
		t.Fatalf("Expected admin to see audit logs, got 0")
	}

	hasFam1 := false
	hasFam2 := false
	hasMembership := false
	hasHygiene := false
	for _, l := range adminLogs {
		if l.FamilyID != nil && *l.FamilyID == fam1.ID {
			hasFam1 = true
		}
		if l.FamilyID != nil && *l.FamilyID == fam2.ID {
			hasFam2 = true
		}
		if l.EntityType == "th_membership" {
			hasMembership = true
		}
		if l.EntityType == "hygiene_event" {
			hasHygiene = true
		}
	}
	if !hasFam1 || !hasFam2 || !hasMembership || !hasHygiene {
		t.Errorf("Admin should see all entity types across both families. fam1=%v, fam2=%v, membership=%v, hygiene=%v", hasFam1, hasFam2, hasMembership, hasHygiene)
	}

	// 2. Caregiver User without families.all.read / memberships.all.write
	caregiverUser := &models.UserWithPermissions{
		Email:                "caregiver@example.com",
		EffectivePermissions: []string{"children.all.write", "hygiene.all.write", "audit.view"},
	}
	caregiverLogs, err := appStore.ListAuditLogsForUser(ctx, caregiverUser)
	if err != nil {
		t.Fatalf("ListAuditLogsForUser caregiver failed: %v", err)
	}
	for _, l := range caregiverLogs {
		if l.EntityType == "th_membership" {
			t.Errorf("Caregiver should NOT see th_membership logs")
		}
		if l.EntityType == "family" || l.EntityType == "parent" {
			t.Errorf("Caregiver without families.all.read should NOT see family or parent logs, got %s", l.EntityType)
		}
		if l.EntityType != "child" && l.EntityType != "child_group_change" && l.EntityType != "hygiene_event" {
			t.Errorf("Unexpected entity type for caregiver: %s", l.EntityType)
		}
	}

	// 3. Treasurer User without hygiene.all.write / children.all.write
	treasurerUser := &models.UserWithPermissions{
		Email:                "treasurer@example.com",
		EffectivePermissions: []string{"fees.all.read", "memberships.all.write", "audit.view"},
	}
	treasurerLogs, err := appStore.ListAuditLogsForUser(ctx, treasurerUser)
	if err != nil {
		t.Fatalf("ListAuditLogsForUser treasurer failed: %v", err)
	}
	for _, l := range treasurerLogs {
		if l.EntityType == "hygiene_event" {
			t.Errorf("Treasurer should NOT see hygiene_event logs")
		}
		if l.EntityType == "child" || l.EntityType == "child_group_change" {
			t.Errorf("Treasurer without children.all.write or families.all.read should NOT see child logs, got %s", l.EntityType)
		}
	}

	// 4. Self-Service Parent of Family 1
	selfParentUser := &models.UserWithPermissions{
		Email:                "parent1@example.com",
		FamilyID:             &fam1.ID,
		EffectivePermissions: []string{"families.self.selfservice", "audit.view"},
	}
	selfParentLogs, err := appStore.ListAuditLogsForUser(ctx, selfParentUser)
	if err != nil {
		t.Fatalf("ListAuditLogsForUser selfParent failed: %v", err)
	}
	if len(selfParentLogs) == 0 {
		t.Fatalf("Self parent should see own family logs, got 0")
	}
	for _, l := range selfParentLogs {
		if l.FamilyID == nil || *l.FamilyID != fam1.ID {
			t.Errorf("Self parent should NEVER see logs from other families, got family: %v", l.FamilyID)
		}
		if l.EntityType == "hygiene_event" || l.EntityType == "th_membership" {
			t.Errorf("Self parent should not see internal hygiene or membership logs, got %s", l.EntityType)
		}
		// Verify notes redaction in snapshots
		if l.EntityType == "parent" && len(l.AfterSnapshot) > 0 {
			var snap map[string]interface{}
			json.Unmarshal(l.AfterSnapshot, &snap)
			if notes, ok := snap["notes"].(string); ok && notes != "" {
				t.Errorf("Confidential notes must be redacted for self parent, got: %q", notes)
			}
		}
	}
}

func TestEmployee_CRUDAndAudit(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := NewStore(pool)
	testUserID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, 'emp-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)

	// 1. Validation tests
	_, err = appStore.CreateEmployee(ctx, testUserID, models.Employee{
		FirstName:    "",
		LastName:     "Schmidt",
		EmployeeType: "caregiver",
	})
	if err == nil {
		t.Error("expected error for empty first name")
	}

	_, err = appStore.CreateEmployee(ctx, testUserID, models.Employee{
		FirstName:    "Maria",
		LastName:     "Schmidt",
		EmployeeType: "invalid_type",
	})
	if err == nil {
		t.Error("expected error for invalid employee_type")
	}

	// 2. Create Employee
	emp := models.Employee{
		FirstName:    "Maria",
		LastName:     "Schmidt",
		EmployeeType: "caregiver",
		Emails: models.MultiValueList{
			{Value: "maria@example.com", IdentifierEmail: true, AddressList: true},
		},
		Phones: models.MultiValueList{
			{Value: "0170123456", AddressList: true},
		},
		Address:                    "Hauptstr. 10, 10115 Berlin",
		IsKinderschutzbeauftragter: true,
	}

	created, err := appStore.CreateEmployee(ctx, testUserID, emp)
	if err != nil {
		t.Fatalf("failed to create employee: %v", err)
	}
	if created.ID == uuid.Nil {
		t.Fatal("expected valid UUID for created employee")
	}
	if created.FirstName != "Maria" || created.LastName != "Schmidt" || created.EmployeeType != "caregiver" {
		t.Errorf("unexpected created employee fields: %+v", created)
	}
	if !created.IsKinderschutzbeauftragter {
		t.Errorf("expected IsKinderschutzbeauftragter=true")
	}
	if len(created.Emails) != 1 || !created.Emails[0].IdentifierEmail {
		t.Errorf("unexpected emails: %+v", created.Emails)
	}

	defer func() {
		_ = appStore.DeleteEmployee(ctx, testUserID, created.ID)
	}()

	// 3. GetEmployeeByID & ListEmployees
	fetched, err := appStore.GetEmployeeByID(ctx, created.ID)
	if err != nil || fetched == nil {
		t.Fatalf("failed to fetch employee by ID: %v", err)
	}
	if fetched.LastName != "Schmidt" || fetched.Address != "Hauptstr. 10, 10115 Berlin" {
		t.Errorf("mismatched fetched employee: %+v", fetched)
	}

	list, err := appStore.ListEmployees(ctx)
	if err != nil {
		t.Fatalf("failed to list employees: %v", err)
	}
	found := false
	for _, e := range list {
		if e.ID == created.ID {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("created employee not found in ListEmployees")
	}

	// 4. Update Employee
	created.LastName = "Schmidt-Mueller"
	created.EmployeeType = "cook"
	created.IsKinderschutzbeauftragter = false
	created.Address = "Nebenstr. 5, 10115 Berlin"
	created.Phones = append(created.Phones, models.MultiValueEntry{Value: "0170999999", AddressList: false})

	updated, err := appStore.UpdateEmployee(ctx, testUserID, created)
	if err != nil {
		t.Fatalf("failed to update employee: %v", err)
	}
	if updated.LastName != "Schmidt-Mueller" || updated.EmployeeType != "cook" || updated.IsKinderschutzbeauftragter != false {
		t.Errorf("unexpected updated employee: %+v", updated)
	}
	if len(updated.Phones) != 2 {
		t.Errorf("expected 2 phones after update, got %d", len(updated.Phones))
	}

	// 5. Delete Employee
	err = appStore.DeleteEmployee(ctx, testUserID, created.ID)
	if err != nil {
		t.Fatalf("failed to delete employee: %v", err)
	}

	afterDelete, err := appStore.GetEmployeeByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("error querying deleted employee: %v", err)
	}
	if afterDelete != nil {
		t.Errorf("expected deleted employee to be nil, got: %+v", afterDelete)
	}

	// 6. Check Audit Logs for Employee INSERT, UPDATE, DELETE
	adminUser := &models.UserWithPermissions{
		ID:                   testUserID,
		Email:                "emp-tester@example.com",
		EffectivePermissions: []string{"employees.all.read", "audit.view"},
	}
	auditLogs, err := appStore.ListAuditLogsForUser(ctx, adminUser)
	if err != nil {
		t.Fatalf("ListAuditLogsForUser failed: %v", err)
	}

	var empOps []string
	for _, l := range auditLogs {
		if l.EntityType == "employee" && l.EntityID == created.ID {
			empOps = append(empOps, l.Operation)
		}
	}

	// Should have INSERT, UPDATE, DELETE (order in query is DESC, so DELETE, UPDATE, INSERT)
	hasInsert, hasUpdate, hasDelete := false, false, false
	for _, op := range empOps {
		if op == "INSERT" {
			hasInsert = true
		}
		if op == "UPDATE" {
			hasUpdate = true
		}
		if op == "DELETE" {
			hasDelete = true
		}
	}
	if !hasInsert || !hasUpdate || !hasDelete {
		t.Errorf("expected INSERT, UPDATE, DELETE audit logs for employee, got: %v", empOps)
	}
}

func TestChild_Familiencards(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := NewStore(pool)
	testUserID := uuid.Nil
	familyID := uuid.New()
	childID := uuid.New()

	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM children WHERE id = $1", childID)
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
	}()

	child := models.Child{
		ID:            childID,
		FamilyID:      familyID,
		FirstName:     "Lisa",
		LastName:      "Simpson",
		BirthDate:     time.Date(2020, 1, 15, 0, 0, 0, 0, time.UTC),
		Familiencards: models.FamiliencardList{2025, 2026},
	}

	// 1. Create Child with familiencards
	if err := appStore.UpdateChild(ctx, testUserID, childID, child); err != nil {
		t.Fatalf("UpdateChild create failed: %v", err)
	}

	// 2. Fetch families and verify familiencards
	families, err := appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("ListFamilies failed: %v", err)
	}

	var foundChild *models.Child
	for _, f := range families {
		for _, c := range f.Children {
			if c.ID == childID {
				foundChild = &c
				break
			}
		}
	}
	if foundChild == nil {
		t.Fatalf("child %s not found in families", childID)
	}
	if len(foundChild.Familiencards) != 2 {
		t.Fatalf("expected 2 familiencards, got %d", len(foundChild.Familiencards))
	}
	if foundChild.Familiencards[0] != 2025 || foundChild.Familiencards[1] != 2026 {
		t.Errorf("unexpected familiencards content: %+v", foundChild.Familiencards)
	}

	// 3. Update Child familiencards (remove 2025, add 2027)
	child.Familiencards = models.FamiliencardList{2026, 2027}
	if err := appStore.UpdateChild(ctx, testUserID, childID, child); err != nil {
		t.Fatalf("UpdateChild update failed: %v", err)
	}

	families, err = appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("ListFamilies failed: %v", err)
	}
	for _, f := range families {
		for _, c := range f.Children {
			if c.ID == childID {
				foundChild = &c
				break
			}
		}
	}
	if len(foundChild.Familiencards) != 2 {
		t.Fatalf("expected 2 familiencards after update, got %d", len(foundChild.Familiencards))
	}
	if foundChild.Familiencards[1] != 2027 {
		t.Errorf("expected 2027, got: %+v", foundChild.Familiencards[1])
	}
}




