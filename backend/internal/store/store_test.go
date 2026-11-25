package store

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/crypto"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

func TestMain(m *testing.M) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	database.ApplySchemaMigrations(context.Background(), dbURL)
	os.Exit(m.Run())
}

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
	// - On 2099-10-09 (Friday): 2099-10-09 is present -> "yellow_bin_retrieve" AND it's Friday -> "clean_refrigerator"
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

	// Insert meal allergen entry for Friday 2099-10-09
	_, err = appStore.UpsertMealAllergens(
		ctx,
		fridayDate,
		nil,
		nil,
		"Chef Mario",
		models.MealAllergenComponentList{
			{Name: "Tomatensuppe", Allergens: []string{"sellerie"}},
			{Name: "Pasta Pesto", Allergens: []string{"gluten", "milch"}},
		},
		models.MealAllergenDocumentation{},
		nil,
	)
	if err != nil {
		t.Fatalf("failed to upsert meal allergens: %v", err)
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
	if !briefFriday.HasAllergenRecord {
		t.Errorf("expected HasAllergenRecord to be true for Friday")
	}
	if len(briefFriday.AllergenMealComponents) != 2 {
		t.Errorf("expected 2 allergen meal components for Friday, got %d", len(briefFriday.AllergenMealComponents))
	} else if briefFriday.AllergenMealComponents[0].Name != "Tomatensuppe" || len(briefFriday.AllergenMealComponents[0].Allergens) != 1 {
		t.Errorf("unexpected allergen meal component: %+v", briefFriday.AllergenMealComponents[0])
	}

	// Tasks for Friday: yellow_bin_retrieve and clean_refrigerator
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
	if hasCoffee {
		t.Errorf("unexpected 'clean_coffe_machine' in tasks, got: %+v", briefFriday.TasksAndInfo)
	}
	if !hasRefrigerator {
		t.Errorf("expected 'clean_refrigerator' in tasks, got: %+v", briefFriday.TasksAndInfo)
	}

	// Verify default screensaver exit times
	if len(briefFriday.ScreensaverExitTimes) != 2 || briefFriday.ScreensaverExitTimes[0] != "09:30" || briefFriday.ScreensaverExitTimes[1] != "10:00" {
		t.Errorf("expected default screensaver exit times ['09:30', '10:00'], got %+v", briefFriday.ScreensaverExitTimes)
	}

	// Verify env override of screensaver exit times
	os.Setenv("KIOSK_SCREENSAVER_EXIT_TIMES", "08:15, 12:45, 16:30")
	briefEnv, err := appStore.GetDailyBrief(ctx, fridayDate)
	os.Unsetenv("KIOSK_SCREENSAVER_EXIT_TIMES")
	if err != nil {
		t.Fatalf("GetDailyBrief failed with env: %v", err)
	}
	if len(briefEnv.ScreensaverExitTimes) != 3 || briefEnv.ScreensaverExitTimes[0] != "08:15" || briefEnv.ScreensaverExitTimes[1] != "12:45" || briefEnv.ScreensaverExitTimes[2] != "16:30" {
		t.Errorf("expected overridden screensaver exit times, got %+v", briefEnv.ScreensaverExitTimes)
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
	if briefThursday.HasAllergenRecord {
		t.Errorf("expected HasAllergenRecord to be false for Thursday")
	}
	if len(briefThursday.AllergenMealComponents) != 0 {
		t.Errorf("expected 0 allergen meal components for Thursday, got %d", len(briefThursday.AllergenMealComponents))
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

func TestDashboardTasks_Store(t *testing.T) {
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

	testDateStr := "2099-11-20"
	testDate := time.Date(2099, time.November, 20, 0, 0, 0, 0, time.UTC)

	// Clean up after test
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM completed_tasks WHERE task_date = $1", testDateStr)
		_, _ = pool.Exec(ctx, "DELETE FROM meal_allergens WHERE date = $1", testDateStr)
		_, _ = pool.Exec(ctx, "DELETE FROM meal_allergens_history WHERE cooking_date = $1", testDateStr)
	}()

	// 1. CompleteTask by authenticated user
	userID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'task-user@example.com', 'task-user@example.com') ON CONFLICT (id) DO NOTHING", userID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	}()

	userActor := models.MealAllergenActor{
		UserID:    &userID,
		Email:     "task-user@example.com",
		IsKiosk:   false,
		KioskName: "",
	}

	ctUser, err := appStore.CompleteTask(ctx, testDate, "clean_coffee_machine", userActor)
	if err != nil {
		t.Fatalf("CompleteTask failed for user: %v", err)
	}
	if ctUser.TaskTypeID != "clean_coffee_machine" || ctUser.TaskDate != testDateStr {
		t.Errorf("unexpected task result: %+v", ctUser)
	}
	if ctUser.IsKiosk || ctUser.CompletedByEmail != "task-user@example.com" || ctUser.CompletedBy == nil || *ctUser.CompletedBy != userID {
		t.Errorf("unexpected user completion metadata: %+v", ctUser)
	}

	// 2. CompleteTask by kiosk
	kioskActor := models.MealAllergenActor{
		UserID:    nil,
		Email:     "kiosk+CN=kiosk-tablet-1@internal",
		IsKiosk:   true,
		KioskName: "kiosk-tablet-1",
	}
	ctKiosk, err := appStore.CompleteTask(ctx, testDate, "yellow_bin_put_out", kioskActor)
	if err != nil {
		t.Fatalf("CompleteTask failed for kiosk: %v", err)
	}
	if !ctKiosk.IsKiosk || ctKiosk.KioskName != "kiosk-tablet-1" || ctKiosk.CompletedBy != nil {
		t.Errorf("unexpected kiosk completion metadata: %+v", ctKiosk)
	}

	// 3. Verify GetDailyBrief includes completed tasks
	brief, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if len(brief.CompletedTasks) < 2 {
		t.Errorf("expected at least 2 completed tasks, got %d", len(brief.CompletedTasks))
	}
	hasCoffeeDone := false
	hasYellowDone := false
	for _, ct := range brief.CompletedTasks {
		if ct.TaskTypeID == "clean_coffee_machine" {
			hasCoffeeDone = true
		}
		if ct.TaskTypeID == "yellow_bin_put_out" {
			hasYellowDone = true
		}
	}
	if !hasCoffeeDone || !hasYellowDone {
		t.Errorf("expected completed tasks in brief, got: %+v", brief.CompletedTasks)
	}

	// 4. UncompleteTask
	if err := appStore.UncompleteTask(ctx, testDate, "yellow_bin_put_out"); err != nil {
		t.Fatalf("UncompleteTask failed: %v", err)
	}
	completedAfterUncheck, err := appStore.GetCompletedTasks(ctx, testDate)
	if err != nil {
		t.Fatalf("GetCompletedTasks failed: %v", err)
	}
	for _, ct := range completedAfterUncheck {
		if ct.TaskTypeID == "yellow_bin_put_out" {
			t.Errorf("task yellow_bin_put_out should have been uncompleted")
		}
	}

	// 5. Finalize meal allergens marks enter_allergens as completed
	cookName := "Allergen Cook"
	_, err = appStore.UpsertMealAllergensWithCooks(
		ctx,
		testDate,
		models.MealAllergenCookList{},
		nil,
		nil,
		cookName,
		models.MealAllergenComponentList{{Name: "Suppe", Allergens: []string{"sellerie"}}},
		models.MealAllergenDocumentation{},
		nil,
		userActor,
	)
	if err != nil {
		t.Fatalf("UpsertMealAllergensWithCooks failed: %v", err)
	}

	_, err = appStore.FinalizeMealAllergens(ctx, testDate, userActor)
	if err != nil {
		t.Fatalf("FinalizeMealAllergens failed: %v", err)
	}

	completedAfterFinalize, err := appStore.GetCompletedTasks(ctx, testDate)
	if err != nil {
		t.Fatalf("GetCompletedTasks after finalize failed: %v", err)
	}
	hasAllergensDone := false
	for _, ct := range completedAfterFinalize {
		if ct.TaskTypeID == "enter_allergens" {
			hasAllergensDone = true
			if ct.CompletedByEmail != "task-user@example.com" {
				t.Errorf("expected enter_allergens completed by task-user@example.com, got %s", ct.CompletedByEmail)
			}
		}
	}
	if !hasAllergensDone {
		t.Errorf("expected enter_allergens to be completed after finalize, got %+v", completedAfterFinalize)
	}
}

func containsTask(tasks []string, taskID string) bool {
	for _, t := range tasks {
		if t == taskID {
			return true
		}
	}
	return false
}

func TestDishwasherFilterTask_Store(t *testing.T) {
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

	// Test Mon through Fri: 2026-11-16 (Mon) to 2026-11-20 (Fri)
	// Weekend: 2026-11-21 (Sat), 2026-11-22 (Sun)
	weekdays := []time.Time{
		time.Date(2026, time.November, 16, 0, 0, 0, 0, time.UTC), // Monday
		time.Date(2026, time.November, 17, 0, 0, 0, 0, time.UTC), // Tuesday
		time.Date(2026, time.November, 18, 0, 0, 0, 0, time.UTC), // Wednesday
		time.Date(2026, time.November, 19, 0, 0, 0, 0, time.UTC), // Thursday
		time.Date(2026, time.November, 20, 0, 0, 0, 0, time.UTC), // Friday
	}
	weekendDays := []time.Time{
		time.Date(2026, time.November, 21, 0, 0, 0, 0, time.UTC), // Saturday
		time.Date(2026, time.November, 22, 0, 0, 0, 0, time.UTC), // Sunday
	}

	for _, d := range weekdays {
		brief, err := appStore.GetDailyBrief(ctx, d)
		if err != nil {
			t.Fatalf("GetDailyBrief failed for %s: %v", d.Format("2006-01-02"), err)
		}
		if !containsTask(brief.TasksAndInfo, TaskCleanDishwasherFilter) {
			t.Errorf("expected %s on weekday %s (%s), got: %+v", TaskCleanDishwasherFilter, d.Weekday(), d.Format("2006-01-02"), brief.TasksAndInfo)
		}
	}

	for _, d := range weekendDays {
		brief, err := appStore.GetDailyBrief(ctx, d)
		if err != nil {
			t.Fatalf("GetDailyBrief failed for weekend %s: %v", d.Format("2006-01-02"), err)
		}
		if containsTask(brief.TasksAndInfo, TaskCleanDishwasherFilter) {
			t.Errorf("unexpected %s on weekend %s (%s), got: %+v", TaskCleanDishwasherFilter, d.Weekday(), d.Format("2006-01-02"), brief.TasksAndInfo)
		}
	}

	// Test task completion and alias resolution
	testDate := weekdays[0]
	testDateStr := testDate.Format("2006-01-02")
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM completed_tasks WHERE task_date = $1", testDateStr)
	}()

	actor := models.MealAllergenActor{
		Email:   "test@example.com",
		IsKiosk: false,
	}

	ct, err := appStore.CompleteTask(ctx, testDate, TaskCleanDishwasherFilter, actor)
	if err != nil {
		t.Fatalf("CompleteTask failed: %v", err)
	}
	if ct.TaskTypeID != TaskCleanDishwasherFilter {
		t.Errorf("expected task type %s, got %s", TaskCleanDishwasherFilter, ct.TaskTypeID)
	}

	briefCompleted, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if !containsTask(briefCompleted.CompletedTaskIDs, TaskCleanDishwasherFilter) {
		t.Errorf("expected %s in completed task IDs, got: %+v", TaskCleanDishwasherFilter, briefCompleted.CompletedTaskIDs)
	}
	if !containsTask(briefCompleted.CompletedTaskIDs, TaskCleanDishwasherFilterGerman) {
		t.Errorf("expected %s alias in completed task IDs, got: %+v", TaskCleanDishwasherFilterGerman, briefCompleted.CompletedTaskIDs)
	}
	if !containsTask(briefCompleted.CompletedTaskIDs, TaskCleanDishwasherFilterGermanLegacy) {
		t.Errorf("expected %s legacy alias in completed task IDs, got: %+v", TaskCleanDishwasherFilterGermanLegacy, briefCompleted.CompletedTaskIDs)
	}

	// Uncomplete
	if err := appStore.UncompleteTask(ctx, testDate, TaskCleanDishwasherFilterGerman); err != nil {
		t.Fatalf("UncompleteTask failed: %v", err)
	}
	briefUncompleted, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if containsTask(briefUncompleted.CompletedTaskIDs, TaskCleanDishwasherFilter) {
		t.Errorf("expected task to be uncompleted, got: %+v", briefUncompleted.CompletedTaskIDs)
	}
}

func TestServingTasks_Store(t *testing.T) {
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

	weekdays := []time.Time{
		time.Date(2026, time.November, 16, 0, 0, 0, 0, time.UTC), // Monday
		time.Date(2026, time.November, 17, 0, 0, 0, 0, time.UTC), // Tuesday
		time.Date(2026, time.November, 18, 0, 0, 0, 0, time.UTC), // Wednesday
		time.Date(2026, time.November, 19, 0, 0, 0, 0, time.UTC), // Thursday
		time.Date(2026, time.November, 20, 0, 0, 0, 0, time.UTC), // Friday
	}
	weekendDays := []time.Time{
		time.Date(2026, time.November, 21, 0, 0, 0, 0, time.UTC), // Saturday
		time.Date(2026, time.November, 22, 0, 0, 0, 0, time.UTC), // Sunday
	}

	servingTasks := []string{TaskServeSmallGroup, TaskServeLargeGroup, TaskServeHort}

	for _, d := range weekdays {
		brief, err := appStore.GetDailyBrief(ctx, d)
		if err != nil {
			t.Fatalf("GetDailyBrief failed for %s: %v", d.Format("2006-01-02"), err)
		}
		for _, taskID := range servingTasks {
			if !containsTask(brief.TasksAndInfo, taskID) {
				t.Errorf("expected %s on weekday %s (%s), got: %+v", taskID, d.Weekday(), d.Format("2006-01-02"), brief.TasksAndInfo)
			}
		}
	}

	for _, d := range weekendDays {
		brief, err := appStore.GetDailyBrief(ctx, d)
		if err != nil {
			t.Fatalf("GetDailyBrief failed for weekend %s: %v", d.Format("2006-01-02"), err)
		}
		for _, taskID := range servingTasks {
			if containsTask(brief.TasksAndInfo, taskID) {
				t.Errorf("unexpected %s on weekend %s (%s), got: %+v", taskID, d.Weekday(), d.Format("2006-01-02"), brief.TasksAndInfo)
			}
		}
	}

	testDate := weekdays[0]
	testDateStr := testDate.Format("2006-01-02")
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM completed_tasks WHERE task_date = $1", testDateStr)
	}()

	actor := models.MealAllergenActor{
		Email:   "test@example.com",
		IsKiosk: false,
	}

	for _, pair := range []struct {
		id     string
		name   string
		german string
	}{
		{TaskServeSmallGroup, TaskServeSmallGroupName, TaskServeSmallGroupGerman},
		{TaskServeLargeGroup, TaskServeLargeGroupName, TaskServeLargeGroupGerman},
		{TaskServeHort, TaskServeHortName, TaskServeHortGerman},
	} {
		ct, err := appStore.CompleteTask(ctx, testDate, pair.id, actor)
		if err != nil {
			t.Fatalf("CompleteTask(%s) failed: %v", pair.id, err)
		}
		if ct.TaskTypeID != pair.id {
			t.Errorf("expected task type %s, got %s", pair.id, ct.TaskTypeID)
		}

		briefCompleted, err := appStore.GetDailyBrief(ctx, testDate)
		if err != nil {
			t.Fatalf("GetDailyBrief failed: %v", err)
		}
		if !containsTask(briefCompleted.CompletedTaskIDs, pair.id) {
			t.Errorf("expected %s in completed task IDs, got: %+v", pair.id, briefCompleted.CompletedTaskIDs)
		}
		if !containsTask(briefCompleted.CompletedTaskIDs, pair.name) {
			t.Errorf("expected %s name alias in completed task IDs, got: %+v", pair.name, briefCompleted.CompletedTaskIDs)
		}
		if !containsTask(briefCompleted.CompletedTaskIDs, pair.german) {
			t.Errorf("expected %s alias in completed task IDs, got: %+v", pair.german, briefCompleted.CompletedTaskIDs)
		}

		if err := appStore.UncompleteTask(ctx, testDate, pair.german); err != nil {
			t.Fatalf("UncompleteTask(%s) failed: %v", pair.german, err)
		}
	}
}

func TestBufdiAbsenceTasks_ConditionsAndLifecycle(t *testing.T) {
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

	testDateStr := "2099-05-18" // Monday
	testDate := time.Date(2099, time.May, 18, 0, 0, 0, 0, time.UTC)

	userID := uuid.New()

	cleanup := func() {
		_, _ = pool.Exec(ctx, "DELETE FROM volunteer_absences WHERE type = 'bufdi' AND start_date <= $1 AND end_date >= $1", testDateStr)
		_, _ = pool.Exec(ctx, "DELETE FROM completed_tasks WHERE task_date = $1", testDateStr)
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	}
	cleanup()
	defer cleanup()

	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'bufdi-test@example.com', 'bufdi-test@example.com') ON CONFLICT (id) DO NOTHING", userID)
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}

	// 1. Without absence: start_dryer, start_washer, change_diaper_bag should NOT be in TasksAndInfo
	briefNoAbsence, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if briefNoAbsence.HasVolunteerAbsence {
		t.Errorf("expected HasVolunteerAbsence to be false without absence")
	}
	if containsTask(briefNoAbsence.TasksAndInfo, TaskStartDryer) ||
		containsTask(briefNoAbsence.TasksAndInfo, TaskStartWasher) ||
		containsTask(briefNoAbsence.TasksAndInfo, TaskChangeDiaperBag) {
		t.Errorf("expected bufdi tasks to NOT appear without absence, got: %+v", briefNoAbsence.TasksAndInfo)
	}

	// 2. Add absence (without specifying BufdiName, should default to global bufdi name):
	absence, err := appStore.CreateVolunteerAbsence(ctx, userID, models.VolunteerAbsence{
		Type:      "bufdi",
		StartDate: "2099-05-17",
		EndDate:   "2099-05-20",
		Note:      "Seminar",
	}, "bufdi-test@example.com")
	if err != nil {
		t.Fatalf("CreateVolunteerAbsence failed: %v", err)
	}
	if absence.BufdiName == "" {
		t.Errorf("expected absence.BufdiName to default to global name, got empty")
	}

	// 3. With absence added: start_dryer, start_washer, change_diaper_bag should appear
	briefWithAbsence, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if !briefWithAbsence.HasVolunteerAbsence {
		t.Errorf("expected HasVolunteerAbsence to be true with absence")
	}
	if briefWithAbsence.VolunteerName != absence.BufdiName {
		t.Errorf("expected VolunteerName %q to match absence BufdiName %q", briefWithAbsence.VolunteerName, absence.BufdiName)
	}

	// Update absence with a custom BufdiName on the absence itself
	updatedAbsence, err := appStore.UpdateVolunteerAbsence(ctx, userID, models.VolunteerAbsence{
		ID:        absence.ID,
		Type:      "bufdi",
		BufdiName: "CustomBuFDI",
		StartDate: "2099-05-17",
		EndDate:   "2099-05-20",
		Note:      "Seminar Updated",
	}, "bufdi-test@example.com")
	if err != nil {
		t.Fatalf("UpdateVolunteerAbsence with custom BufdiName failed: %v", err)
	}
	if updatedAbsence.BufdiName != "CustomBuFDI" {
		t.Errorf("expected updated absence BufdiName 'CustomBuFDI', got %q", updatedAbsence.BufdiName)
	}

	briefWithCustom, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if briefWithCustom.VolunteerName != "CustomBuFDI" {
		t.Errorf("expected daily brief VolunteerName to reflect absence property 'CustomBuFDI', got %q", briefWithCustom.VolunteerName)
	}
	if !containsTask(briefWithAbsence.TasksAndInfo, TaskStartDryer) {
		t.Errorf("expected %s in tasks, got: %+v", TaskStartDryer, briefWithAbsence.TasksAndInfo)
	}
	if !containsTask(briefWithAbsence.TasksAndInfo, TaskStartWasher) {
		t.Errorf("expected %s in tasks, got: %+v", TaskStartWasher, briefWithAbsence.TasksAndInfo)
	}
	if !containsTask(briefWithAbsence.TasksAndInfo, TaskChangeDiaperBag) {
		t.Errorf("expected %s in tasks, got: %+v", TaskChangeDiaperBag, briefWithAbsence.TasksAndInfo)
	}
	if !containsTask(briefWithAbsence.TasksAndInfo, TaskFoldLaundry) {
		t.Errorf("expected %s in tasks, got: %+v", TaskFoldLaundry, briefWithAbsence.TasksAndInfo)
	}

	// 4. User completes start_dryer task
	userActor := models.MealAllergenActor{
		UserID:    &userID,
		Email:     "bufdi-test@example.com",
		IsKiosk:   false,
		KioskName: "",
	}
	ct, err := appStore.CompleteTask(ctx, testDate, TaskStartDryer, userActor)
	if err != nil {
		t.Fatalf("CompleteTask failed: %v", err)
	}
	if ct.TaskTypeID != TaskStartDryer {
		t.Errorf("expected task type %s, got %s", TaskStartDryer, ct.TaskTypeID)
	}

	// Verify it shows as completed for label, name, and key alias
	briefCompleted, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if !containsTask(briefCompleted.CompletedTaskIDs, TaskStartDryer) {
		t.Errorf("expected %s in completed task IDs, got: %+v", TaskStartDryer, briefCompleted.CompletedTaskIDs)
	}
	if !containsTask(briefCompleted.CompletedTaskIDs, TaskKeyStartDryer) {
		t.Errorf("expected %s in completed task IDs, got: %+v", TaskKeyStartDryer, briefCompleted.CompletedTaskIDs)
	}
	if !containsTask(briefCompleted.CompletedTaskIDs, TaskNameStartDryer) {
		t.Errorf("expected %s in completed task IDs, got: %+v", TaskNameStartDryer, briefCompleted.CompletedTaskIDs)
	}

	// Completing via key alias (start_washer) should also mark TaskStartWasher as completed
	_, err = appStore.CompleteTask(ctx, testDate, TaskKeyStartWasher, userActor)
	if err != nil {
		t.Fatalf("CompleteTask for alias failed: %v", err)
	}
	briefWasherCompleted, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if !containsTask(briefWasherCompleted.CompletedTaskIDs, TaskStartWasher) ||
		!containsTask(briefWasherCompleted.CompletedTaskIDs, TaskKeyStartWasher) {
		t.Errorf("expected %s to be marked completed when completed via alias, got: %+v", TaskStartWasher, briefWasherCompleted.CompletedTaskIDs)
	}

	// 5. Remove the absence: the task should disappear from TasksAndInfo
	err = appStore.DeleteVolunteerAbsence(ctx, userID, absence.ID, "bufdi-test@example.com")
	if err != nil {
		t.Fatalf("DeleteVolunteerAbsence failed: %v", err)
	}

	briefAfterDelete, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if containsTask(briefAfterDelete.TasksAndInfo, TaskStartDryer) ||
		containsTask(briefAfterDelete.TasksAndInfo, TaskStartWasher) ||
		containsTask(briefAfterDelete.TasksAndInfo, TaskChangeDiaperBag) ||
		containsTask(briefAfterDelete.TasksAndInfo, TaskFoldLaundry) {
		t.Errorf("expected bufdi tasks to disappear when absence removed, got: %+v", briefAfterDelete.TasksAndInfo)
	}

	// 6. Re-add absence: task reappears AND is still marked as completed!
	_, err = appStore.CreateVolunteerAbsence(ctx, userID, models.VolunteerAbsence{
		Type:      "bufdi",
		StartDate: "2099-05-18",
		EndDate:   "2099-05-18",
		Note:      "Seminar re-added",
	}, "bufdi-test@example.com")
	if err != nil {
		t.Fatalf("Re-creating volunteer absence failed: %v", err)
	}

	briefReAdded, err := appStore.GetDailyBrief(ctx, testDate)
	if err != nil {
		t.Fatalf("GetDailyBrief failed: %v", err)
	}
	if !containsTask(briefReAdded.TasksAndInfo, TaskStartDryer) {
		t.Errorf("expected %s to reappear after absence re-added, got: %+v", TaskStartDryer, briefReAdded.TasksAndInfo)
	}
	if !containsTask(briefReAdded.CompletedTaskIDs, TaskStartDryer) {
		t.Errorf("expected %s to still be marked as completed after absence re-added, got: %+v", TaskStartDryer, briefReAdded.CompletedTaskIDs)
	}
}

func TestVolunteerAbsenceSettings(t *testing.T) {
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

	// 1. Initial default should be "BuFDI"
	name, err := appStore.GetBufdiName(ctx)
	if err != nil {
		t.Fatalf("GetBufdiName failed: %v", err)
	}
	if name == "" {
		t.Errorf("expected non-empty default bufdi name, got empty")
	}

	// 2. Set custom name
	err = appStore.SetBufdiName(ctx, "Max & Moritz")
	if err != nil {
		t.Fatalf("SetBufdiName failed: %v", err)
	}

	name2, err := appStore.GetBufdiName(ctx)
	if err != nil {
		t.Fatalf("GetBufdiName failed: %v", err)
	}
	if name2 != "Max & Moritz" {
		t.Errorf("expected 'Max & Moritz', got '%s'", name2)
	}

	// 3. Reset to empty string should fallback to "BuFDI"
	err = appStore.SetBufdiName(ctx, "   ")
	if err != nil {
		t.Fatalf("SetBufdiName with empty failed: %v", err)
	}
	name3, err := appStore.GetBufdiName(ctx)
	if err != nil {
		t.Fatalf("GetBufdiName failed: %v", err)
	}
	if name3 != "BuFDI" {
		t.Errorf("expected fallback 'BuFDI', got '%s'", name3)
	}
}

func TestDashboardTaskConditions(t *testing.T) {
	// Wednesday is a Vesper day
	wednesday := time.Date(2026, 11, 18, 0, 0, 0, 0, time.UTC)
	// Tuesday is NOT a Vesper day
	tuesday := time.Date(2026, 11, 17, 0, 0, 0, 0, time.UTC)

	// Test OnlyIfBufdiAbsence
	taskBufdi := DashboardTaskDefinition{
		ID:                 "bufdi_only_task",
		OnlyIfBufdiAbsence: true,
	}
	if taskBufdi.Applies(&TaskEvaluationContext{HasBufdiAbsence: false}) {
		t.Errorf("expected task with OnlyIfBufdiAbsence to not apply when HasBufdiAbsence is false")
	}
	if !taskBufdi.Applies(&TaskEvaluationContext{HasBufdiAbsence: true}) {
		t.Errorf("expected task with OnlyIfBufdiAbsence to apply when HasBufdiAbsence is true")
	}

	// Test OnlyIfVesperDay
	taskVesper := DashboardTaskDefinition{
		ID:              "vesper_only_task",
		OnlyIfVesperDay: true,
	}
	if taskVesper.Applies(&TaskEvaluationContext{Date: tuesday, IsVesperDay: false}) {
		t.Errorf("expected task with OnlyIfVesperDay to not apply on Tuesday")
	}
	if !taskVesper.Applies(&TaskEvaluationContext{Date: wednesday, IsVesperDay: true}) {
		t.Errorf("expected task with OnlyIfVesperDay to apply on Wednesday")
	}

	// Test Combined conditions: BufdiAbsence AND VesperDay
	taskCombined := DashboardTaskDefinition{
		ID:                 "combined_task",
		OnlyIfBufdiAbsence: true,
		OnlyIfVesperDay:    true,
	}
	if taskCombined.Applies(&TaskEvaluationContext{Date: wednesday, IsVesperDay: true, HasBufdiAbsence: false}) {
		t.Errorf("expected combined task to fail when HasBufdiAbsence is false")
	}
	if taskCombined.Applies(&TaskEvaluationContext{Date: tuesday, IsVesperDay: false, HasBufdiAbsence: true}) {
		t.Errorf("expected combined task to fail when IsVesperDay is false")
	}
	if !taskCombined.Applies(&TaskEvaluationContext{Date: wednesday, IsVesperDay: true, HasBufdiAbsence: true}) {
		t.Errorf("expected combined task to pass when both conditions are true")
	}

	// Test Weekdays condition
	taskFriday := DashboardTaskDefinition{
		ID:       "friday_task",
		Weekdays: []time.Weekday{time.Friday},
	}
	friday := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)
	if taskFriday.Applies(&TaskEvaluationContext{Date: tuesday}) {
		t.Errorf("expected friday task to not apply on Tuesday")
	}
	if !taskFriday.Applies(&TaskEvaluationContext{Date: friday}) {
		t.Errorf("expected friday task to apply on Friday")
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
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'audit-tester@example.com', 'audit-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)
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
	family, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{parent1}, "regular")
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
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'audit-perm-tester@example.com', 'audit-perm-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)
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
	fam1, err := appStore.CreateFamilyWithParents(ctx, testUserID, fam1Parents, "regular")
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
	fam2, err := appStore.CreateFamilyWithParents(ctx, testUserID, fam2Parents, "regular")
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
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'emp-tester@example.com', 'emp-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)

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

func TestStore_FirstNameForAddressList(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
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
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", testUserID, "test-user-"+testUserID.String()+"@example.com")
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	parentID := uuid.New()
	parent := models.Parent{
		ID:                      parentID,
		FirstName:               "Maximilian",
		FirstNameForAddressList: "Max",
		LastName:                "Mustermann",
		Emails: models.MultiValueList{
			{Value: "max@example.com", AddressList: true},
		},
		Phones: models.MultiValueList{
			{Value: "0170123456", AddressList: true},
		},
	}

	family, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{parent}, "regular")
	if err != nil {
		t.Fatalf("CreateFamilyWithParents failed: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, family.ID)
	}()
	if len(family.Parents) == 0 {
		t.Fatalf("expected at least 1 parent created")
	}
	parentID = family.Parents[0].ID

	// Verify parent in ListFamilies
	fams, err := appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("ListFamilies failed: %v", err)
	}
	var foundParent *models.Parent
	for _, f := range fams {
		if f.ID == family.ID {
			for _, p := range f.Parents {
				if p.ID == parentID {
					foundParent = &p
					break
				}
			}
		}
	}
	if foundParent == nil {
		t.Fatalf("parent not found in ListFamilies")
	}
	if foundParent.FirstName != "Maximilian" || foundParent.FirstNameForAddressList != "Max" {
		t.Errorf("expected FirstName=Maximilian and FirstNameForAddressList=Max, got %q, %q", foundParent.FirstName, foundParent.FirstNameForAddressList)
	}

	// Verify parent in GetParentsByFamilyID
	parents, err := appStore.GetParentsByFamilyID(ctx, family.ID)
	if err != nil {
		t.Fatalf("GetParentsByFamilyID failed: %v", err)
	}
	if len(parents) == 0 || parents[0].FirstNameForAddressList != "Max" {
		t.Errorf("expected parent FirstNameForAddressList=Max, got %+v", parents)
	}

	// Create child with FirstNameForAddressList
	childID := uuid.New()
	child := models.Child{
		ID:                      childID,
		FamilyID:                family.ID,
		FirstName:               "Elisabeth",
		FirstNameForAddressList: "Lisa",
		LastName:                "Mustermann",
		BirthDate:               time.Date(2020, 3, 15, 0, 0, 0, 0, time.UTC),
	}
	if err := appStore.UpdateChild(ctx, testUserID, childID, child); err != nil {
		t.Fatalf("UpdateChild failed: %v", err)
	}

	// Verify child in ListFamilies
	fams, err = appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("ListFamilies failed: %v", err)
	}
	var foundChild *models.Child
	for _, f := range fams {
		if f.ID == family.ID {
			for _, c := range f.Children {
				if c.ID == childID {
					foundChild = &c
					break
				}
			}
		}
	}
	if foundChild == nil {
		t.Fatalf("child not found in ListFamilies")
	}
	if foundChild.FirstName != "Elisabeth" || foundChild.FirstNameForAddressList != "Lisa" {
		t.Errorf("expected child FirstName=Elisabeth and FirstNameForAddressList=Lisa, got %q, %q", foundChild.FirstName, foundChild.FirstNameForAddressList)
	}
	if foundChild.SchoolEnrollmentDefault == nil || *foundChild.SchoolEnrollmentDefault != 2026 {
		t.Errorf("expected child SchoolEnrollmentDefault=2026, got %v", foundChild.SchoolEnrollmentDefault)
	}

	// Update parent and child FirstNameForAddressList
	foundParent.FirstNameForAddressList = "Maxi"
	if err := appStore.UpdateFamilyParents(ctx, testUserID, family.ID, []models.Parent{*foundParent}); err != nil {
		t.Fatalf("UpdateFamilyParents failed: %v", err)
	}

	foundChild.FirstNameForAddressList = "Lisi"
	if err := appStore.UpdateChild(ctx, testUserID, childID, *foundChild); err != nil {
		t.Fatalf("UpdateChild failed: %v", err)
	}

	// Verify updated
	fams, err = appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("ListFamilies after update failed: %v", err)
	}
	for _, f := range fams {
		if f.ID == family.ID {
			if len(f.Parents) > 0 && f.Parents[0].FirstNameForAddressList != "Maxi" {
				t.Errorf("expected updated parent FirstNameForAddressList=Maxi, got %q", f.Parents[0].FirstNameForAddressList)
			}
			if len(f.Children) > 0 && f.Children[0].FirstNameForAddressList != "Lisi" {
				t.Errorf("expected updated child FirstNameForAddressList=Lisi, got %q", f.Children[0].FirstNameForAddressList)
			}
		}
	}
}

func TestQueryAuditLogsForUser_PaginationAndSearch(t *testing.T) {
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
	userEmail := "audit-query-user@example.com"
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING", testUserID, userEmail)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	adminUser := &models.UserWithPermissions{
		Email:                userEmail,
		EffectivePermissions: []string{"*"},
	}

	// 1. Create a family with parents (produces audit logs)
	fam, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{
		{
			FirstName: "Albrecht",
			LastName:  "Duerer",
			Address:   "Nuernberg Hauptstr 42",
			Notes:     "SecretStaffOnlyNoteForQueryTest",
			Emails: models.MultiValueList{
				{Value: "albrecht@duerer-art.de", AddressList: true},
			},
		},
	}, "regular")
	if err != nil {
		t.Fatalf("CreateFamilyWithParents failed: %v", err)
	}

	// 2. Add a child (produces child audit log)
	childID := uuid.New()
	err = appStore.UpdateChild(ctx, testUserID, childID, models.Child{
		ID:        childID,
		FamilyID:  fam.ID,
		FirstName: "Felicitas",
		LastName:  "Duerer",
	})
	if err != nil {
		t.Fatalf("UpdateChild failed: %v", err)
	}

	// Verify we have at least 3 audit logs (family INSERT, parent INSERT, child INSERT)
	allLogs, err := appStore.ListAuditLogsForUser(ctx, adminUser)
	if err != nil {
		t.Fatalf("ListAuditLogsForUser failed: %v", err)
	}
	if len(allLogs) < 3 {
		t.Fatalf("expected at least 3 audit logs, got %d", len(allLogs))
	}

	// 3. Search query: user who performed the action (case-insensitive substring)
	logsByUser, _, err := appStore.QueryAuditLogsForUser(ctx, adminUser, models.AuditLogFilter{
		Search: "QUERY-USER",
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser search by user failed: %v", err)
	}
	if len(logsByUser) < 3 {
		t.Errorf("expected at least 3 logs matching user substring 'QUERY-USER', got %d", len(logsByUser))
	}

	// 4. Search query: payload values (case-insensitive substring)
	// 4a. Match parent address
	logsByAddr, _, err := appStore.QueryAuditLogsForUser(ctx, adminUser, models.AuditLogFilter{
		Search: "hauptstr 42",
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser search by address failed: %v", err)
	}
	if len(logsByAddr) == 0 {
		t.Errorf("expected logs matching address 'hauptstr 42', got 0")
	}

	// 4b. Match child name
	logsByChild, _, err := appStore.QueryAuditLogsForUser(ctx, adminUser, models.AuditLogFilter{
		Search: "felicitas",
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser search by child name failed: %v", err)
	}
	if len(logsByChild) == 0 {
		t.Errorf("expected logs matching child name 'felicitas', got 0")
	}

	// 4c. Non-existent query
	logsNonExistent, _, err := appStore.QueryAuditLogsForUser(ctx, adminUser, models.AuditLogFilter{
		Search: "NonExistentWord12345",
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser search non-existent failed: %v", err)
	}
	if len(logsNonExistent) != 0 {
		t.Errorf("expected 0 logs matching non-existent word, got %d", len(logsNonExistent))
	}

	// 5. Pagination by timestamp
	// Fetch page 1 with limit = 1
	p1Logs, hasMore1, err := appStore.QueryAuditLogsForUser(ctx, adminUser, models.AuditLogFilter{
		Limit: 1,
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser page 1 failed: %v", err)
	}
	if len(p1Logs) != 1 {
		t.Fatalf("expected 1 log on page 1, got %d", len(p1Logs))
	}
	if !hasMore1 {
		t.Errorf("expected hasMore=true after page 1")
	}

	// Fetch page 2 using cursor (Before = p1Logs[0].CreatedAt, BeforeID = p1Logs[0].ID)
	p2Logs, hasMore2, err := appStore.QueryAuditLogsForUser(ctx, adminUser, models.AuditLogFilter{
		Limit:    1,
		Before:   &p1Logs[0].CreatedAt,
		BeforeID: &p1Logs[0].ID,
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser page 2 failed: %v", err)
	}
	if len(p2Logs) != 1 {
		t.Fatalf("expected 1 log on page 2, got %d", len(p2Logs))
	}
	if p2Logs[0].ID == p1Logs[0].ID {
		t.Errorf("expected different log on page 2, got same ID %s", p2Logs[0].ID)
	}
	_ = hasMore2

	// 6. Sanitization defense-in-depth:
	// A user without families.all.read (e.g. restricted user)
	// searching for "SecretStaffOnlyNoteForQueryTest" must NOT get any results even if it's in the DB!
	restrictedUser := &models.UserWithPermissions{
		Email:                "restricted@example.com",
		EffectivePermissions: []string{"children.all.write", "audit.view"},
	}
	leakedLogs, _, err := appStore.QueryAuditLogsForUser(ctx, restrictedUser, models.AuditLogFilter{
		Search: "SecretStaffOnlyNoteForQueryTest",
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser restricted test failed: %v", err)
	}
	if len(leakedLogs) != 0 {
		t.Errorf("SECURITY LEAK: restricted user saw audit logs via search on sanitized note! got %d logs", len(leakedLogs))
	}
}

func TestStore_DEKStore(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	if envURL := os.Getenv("DATABASE_URL"); envURL != "" {
		dbURL = envURL
	}
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
	_, _ = pool.Exec(ctx, "TRUNCATE TABLE data_encryption_keys")
	defer func() {
		_, _ = pool.Exec(ctx, "TRUNCATE TABLE data_encryption_keys")
	}()

	// 1. Initially no active DEK for vaccination or allergies
	vacDEK, err := appStore.GetActiveDEK(ctx, crypto.PurposeVaccination)
	if err != nil {
		t.Fatalf("GetActiveDEK vaccination failed: %v", err)
	}
	if vacDEK != nil {
		t.Fatalf("expected nil active DEK initially, got %+v", vacDEK)
	}

	// 2. Create active DEK for vaccination
	id1 := uuid.New()
	saved1, err := appStore.CreateActiveDEK(ctx, crypto.DEKRecord{
		ID:           id1,
		Purpose:      crypto.PurposeVaccination,
		KMSKeyPath:   "projects/test/locations/eur8/keyRings/kr/cryptoKeys/health-data-key",
		EncryptedDEK: []byte("enc-dek-vac-1"),
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("CreateActiveDEK vaccination failed: %v", err)
	}
	if saved1.ID != id1 {
		t.Fatalf("expected ID %s, got %s", id1, saved1.ID)
	}

	// 3. Concurrent/second CreateActiveDEK for same purpose returns existing active DEK
	id2 := uuid.New()
	saved2, err := appStore.CreateActiveDEK(ctx, crypto.DEKRecord{
		ID:           id2,
		Purpose:      crypto.PurposeVaccination,
		KMSKeyPath:   "projects/test/locations/eur8/keyRings/kr/cryptoKeys/health-data-key",
		EncryptedDEK: []byte("enc-dek-vac-2"),
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("second CreateActiveDEK vaccination failed: %v", err)
	}
	if saved2.ID != id1 {
		t.Fatalf("expected existing active DEK ID %s on conflict, got %s", id1, saved2.ID)
	}

	// 4. Separate purpose ('allergies') can have its own active DEK
	idAllergies := uuid.New()
	savedAllergies, err := appStore.CreateActiveDEK(ctx, crypto.DEKRecord{
		ID:           idAllergies,
		Purpose:      crypto.PurposeAllergies,
		KMSKeyPath:   "projects/test/locations/eur8/keyRings/kr/cryptoKeys/allergies-key",
		EncryptedDEK: []byte("enc-dek-allergies-1"),
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("CreateActiveDEK allergies failed: %v", err)
	}
	if savedAllergies.ID != idAllergies {
		t.Fatalf("expected allergies DEK ID %s, got %s", idAllergies, savedAllergies.ID)
	}

	// 5. GetDEKByID resolves both keys
	fetched1, err := appStore.GetDEKByID(ctx, id1)
	if err != nil || fetched1 == nil || string(fetched1.EncryptedDEK) != "enc-dek-vac-1" {
		t.Fatalf("GetDEKByID vaccination mismatch: %+v, err=%v", fetched1, err)
	}
	fetchedAllergies, err := appStore.GetDEKByID(ctx, idAllergies)
	if err != nil || fetchedAllergies == nil || string(fetchedAllergies.EncryptedDEK) != "enc-dek-allergies-1" {
		t.Fatalf("GetDEKByID allergies mismatch: %+v, err=%v", fetchedAllergies, err)
	}
}

func TestJobs_CRUDAndAssignments(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	appStore := NewStore(pool)
	testUserID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'jobs-tester@example.com', 'jobs-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	// 1. Create jobs
	job1, err := appStore.CreateJob(ctx, testUserID, models.Job{
		Name:         "Hygiene",
		Description:  "Hygiene management and instructions",
		ContactEmail: "hygiene@example.com",
	})
	if err != nil {
		t.Fatalf("CreateJob 1 failed: %v", err)
	}
	if job1.Name != "Hygiene" || job1.ContactEmail != "hygiene@example.com" {
		t.Fatalf("unexpected job1: %+v", job1)
	}

	job2, err := appStore.CreateJob(ctx, testUserID, models.Job{
		Name:         "Garten",
		Description:  "Garden maintenance",
		ContactEmail: "garten@example.com",
	})
	if err != nil {
		t.Fatalf("CreateJob 2 failed: %v", err)
	}

	defer func() {
		_ = appStore.DeleteJob(ctx, testUserID, job1.ID)
		_ = appStore.DeleteJob(ctx, testUserID, job2.ID)
	}()

	// Validate non-empty name
	_, err = appStore.CreateJob(ctx, testUserID, models.Job{Name: "   "})
	if err == nil {
		t.Fatalf("expected error creating job with empty name")
	}

	// 2. Update job
	job1.Description = "Updated hygiene description"
	updated1, err := appStore.UpdateJob(ctx, testUserID, job1)
	if err != nil {
		t.Fatalf("UpdateJob failed: %v", err)
	}
	if updated1.Description != "Updated hygiene description" {
		t.Fatalf("expected updated description, got %q", updated1.Description)
	}

	// 3. Create parent & employee to test assignments
	fam, err := appStore.CreateFamilyWithParents(ctx, testUserID, []models.Parent{
		{
			FirstName: "Johannes",
			LastName:  "TestEltern",
		},
	}, "regular")
	if err != nil {
		t.Fatalf("CreateFamilyWithParents failed: %v", err)
	}
	parentID := fam.Parents[0].ID
	defer func() {
		_ = appStore.DeleteFamily(ctx, testUserID, fam.ID)
	}()

	emp, err := appStore.CreateEmployee(ctx, testUserID, models.Employee{
		FirstName:    "Maria",
		LastName:     "TestEmployee",
		EmployeeType: "caregiver",
	})
	if err != nil {
		t.Fatalf("CreateEmployee failed: %v", err)
	}
	defer func() {
		_ = appStore.DeleteEmployee(ctx, testUserID, emp.ID)
	}()

	// 4. Assign jobs to parent and employee
	if err := appStore.SetParentJobs(ctx, testUserID, parentID, []uuid.UUID{job1.ID, job2.ID}); err != nil {
		t.Fatalf("SetParentJobs failed: %v", err)
	}
	if err := appStore.SetEmployeeJobs(ctx, testUserID, emp.ID, []uuid.UUID{job1.ID}); err != nil {
		t.Fatalf("SetEmployeeJobs failed: %v", err)
	}

	// 5. Verify ListJobs shows assignees
	jobsWithAssignees, err := appStore.ListJobs(ctx)
	if err != nil {
		t.Fatalf("ListJobs failed: %v", err)
	}
	var foundJ1 *models.JobWithAssignees
	for i := range jobsWithAssignees {
		if jobsWithAssignees[i].ID == job1.ID {
			foundJ1 = &jobsWithAssignees[i]
			break
		}
	}
	if foundJ1 == nil {
		t.Fatalf("job1 not found in ListJobs")
	}
	if len(foundJ1.Parents) != 1 || foundJ1.Parents[0].ID != parentID {
		t.Fatalf("expected 1 parent assigned to job1, got %+v", foundJ1.Parents)
	}
	if len(foundJ1.Employees) != 1 || foundJ1.Employees[0].ID != emp.ID {
		t.Fatalf("expected 1 employee assigned to job1, got %+v", foundJ1.Employees)
	}

	// 6. Verify ListFamilies includes parent's jobs
	fams, err := appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("ListFamilies failed: %v", err)
	}
	var foundParent *models.Parent
	for _, f := range fams {
		if f.ID == fam.ID {
			for i := range f.Parents {
				if f.Parents[i].ID == parentID {
					foundParent = &f.Parents[i]
					break
				}
			}
		}
	}
	if foundParent == nil {
		t.Fatalf("parent not found in ListFamilies")
	}
	if len(foundParent.Jobs) != 2 {
		t.Fatalf("expected 2 jobs on parent, got %d", len(foundParent.Jobs))
	}

	// 7. Verify ListEmployees includes employee's jobs
	employees, err := appStore.ListEmployees(ctx)
	if err != nil {
		t.Fatalf("ListEmployees failed: %v", err)
	}
	var foundEmp *models.Employee
	for i := range employees {
		if employees[i].ID == emp.ID {
			foundEmp = &employees[i]
			break
		}
	}
	if foundEmp == nil {
		t.Fatalf("employee not found in ListEmployees")
	}
	if len(foundEmp.Jobs) != 1 || foundEmp.Jobs[0].ID != job1.ID {
		t.Fatalf("expected 1 job on employee, got %+v", foundEmp.Jobs)
	}

	// 8. DeleteJob should fail while associations exist
	err = appStore.DeleteJob(ctx, testUserID, job1.ID)
	if err == nil {
		t.Fatalf("expected error deleting job with active associations")
	}
	if !strings.Contains(err.Error(), "active associations") {
		t.Fatalf("unexpected error message: %v", err)
	}

	// 9. Clear associations and delete
	if err := appStore.SetParentJobs(ctx, testUserID, parentID, []uuid.UUID{}); err != nil {
		t.Fatalf("SetParentJobs clear failed: %v", err)
	}
	if err := appStore.SetEmployeeJobs(ctx, testUserID, emp.ID, []uuid.UUID{}); err != nil {
		t.Fatalf("SetEmployeeJobs clear failed: %v", err)
	}

	if err := appStore.DeleteJob(ctx, testUserID, job1.ID); err != nil {
		t.Fatalf("DeleteJob failed after clearing associations: %v", err)
	}
	if err := appStore.DeleteJob(ctx, testUserID, job2.ID); err != nil {
		t.Fatalf("DeleteJob 2 failed: %v", err)
	}
}

func TestJobs_PermissionsAndResolution(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	appStore := NewStore(pool)
	testUserID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'jobs-perm-tester@example.com', 'jobs-perm-tester@example.com') ON CONFLICT (id) DO NOTHING", testUserID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
	}()

	// 1. Create job with initial permissions
	job, err := appStore.CreateJob(ctx, testUserID, models.Job{
		Name:         "Kassenwart",
		Description:  "Finance duties",
		ContactEmail: "finanzen@example.com",
		Roles:        []string{"mga", "viewer"},
	})
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	defer func() {
		_ = appStore.DeleteJob(ctx, testUserID, job.ID)
	}()

	if len(job.Roles) != 2 {
		t.Fatalf("expected 2 roles on created job, got: %+v", job.Roles)
	}

	// 2. GetJobByID returns roles
	fetched, err := appStore.GetJobByID(ctx, job.ID)
	if err != nil || fetched == nil {
		t.Fatalf("GetJobByID failed: %v", err)
	}
	if len(fetched.Roles) != 2 {
		t.Fatalf("expected 2 roles in GetJobByID, got: %+v", fetched.Roles)
	}

	// 3. SetJobRoles updates roles
	updated, err := appStore.SetJobRoles(ctx, testUserID, job.ID, []string{"mga", "viewer", "admin"})
	if err != nil {
		t.Fatalf("SetJobRoles failed: %v", err)
	}
	if len(updated.Roles) != 3 {
		t.Fatalf("expected 3 roles after SetJobRoles, got: %+v", updated.Roles)
	}

	// 4. Test Parent association & GetJobRolesForParent
	familyID := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", familyID)
	if err != nil {
		t.Fatalf("failed to insert family: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
	}()

	parentID := uuid.New()
	emailsJSON := `[{"value":"parent.jobs@example.com","identifier_email":true}]`
	_, err = pool.Exec(ctx, "INSERT INTO parents (id, family_id, first_name, last_name, emails) VALUES ($1, $2, 'Hans', 'Muster', $3)", parentID, familyID, emailsJSON)
	if err != nil {
		t.Fatalf("failed to insert parent: %v", err)
	}

	// Resolve parent info
	pID, fID, err := appStore.GetParentInfoByIdentifierEmail(ctx, "parent.jobs@example.com")
	if err != nil || pID == nil || *pID != parentID || fID == nil || *fID != familyID {
		t.Fatalf("GetParentInfoByIdentifierEmail failed: pID=%v, fID=%v, err=%v", pID, fID, err)
	}

	// Assign job to parent
	if err := appStore.SetParentJobs(ctx, testUserID, parentID, []uuid.UUID{job.ID}); err != nil {
		t.Fatalf("SetParentJobs failed: %v", err)
	}
	defer func() {
		_ = appStore.SetParentJobs(ctx, testUserID, parentID, []uuid.UUID{})
	}()

	parentRoles, err := appStore.GetJobRolesForParent(ctx, parentID)
	if err != nil {
		t.Fatalf("GetJobRolesForParent failed: %v", err)
	}
	if len(parentRoles) != 3 {
		t.Fatalf("expected 3 roles for parent, got: %+v", parentRoles)
	}

	// 5. Test Employee association & GetJobRolesForEmployee
	empID := uuid.New()
	empEmailsJSON := `[{"value":"emp.jobs@example.com","identifier_email":true}]`
	_, err = pool.Exec(ctx, "INSERT INTO employees (id, first_name, last_name, employee_type, emails) VALUES ($1, 'Erika', 'Muster', 'caregiver', $2)", empID, empEmailsJSON)
	if err != nil {
		t.Fatalf("failed to insert employee: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM employees WHERE id = $1", empID)
	}()

	eID, types, err := appStore.GetEmployeeInfoByIdentifierEmail(ctx, "emp.jobs@example.com")
	if err != nil || eID == nil || *eID != empID || len(types) != 1 || types[0] != "caregiver" {
		t.Fatalf("GetEmployeeInfoByIdentifierEmail failed: eID=%v, types=%v, err=%v", eID, types, err)
	}

	if err := appStore.SetEmployeeJobs(ctx, testUserID, empID, []uuid.UUID{job.ID}); err != nil {
		t.Fatalf("SetEmployeeJobs failed: %v", err)
	}
	defer func() {
		_ = appStore.SetEmployeeJobs(ctx, testUserID, empID, []uuid.UUID{})
	}()

	empRoles, err := appStore.GetJobRolesForEmployee(ctx, empID)
	if err != nil {
		t.Fatalf("GetJobRolesForEmployee failed: %v", err)
	}
	if len(empRoles) != 3 {
		t.Fatalf("expected 3 roles for employee, got: %+v", empRoles)
	}
}

func TestCanonicalEmail_UsersParentsEmployees(t *testing.T) {
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

	adminID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, 'canonical-admin@example.com', 'canonical-admin@example.com') ON CONFLICT (id) DO NOTHING", adminID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	}()

	// 1. Users test: create with @googlemail.com and query with @gmail.com and @googlemail.com
	testUserEmail := "test.googlemail.user@googlemail.com"
	u, err := appStore.CreateUser(ctx, testUserEmail, []string{}, []string{"families.all.read"})
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	defer func() {
		_ = appStore.DeleteUser(ctx, u.ID)
	}()

	if u.Email != testUserEmail {
		t.Errorf("expected u.Email to be %q, got %q", testUserEmail, u.Email)
	}
	if u.CanonicalEmail != "testgooglemailuser@gmail.com" {
		t.Errorf("expected u.CanonicalEmail to be 'testgooglemailuser@gmail.com', got %q", u.CanonicalEmail)
	}

	foundViaGooglemail, err := appStore.GetUserWithPermissionsByEmail(ctx, "test.googlemail.user@googlemail.com")
	if err != nil || foundViaGooglemail.ID != u.ID {
		t.Fatalf("GetUserWithPermissionsByEmail via googlemail failed: user=%v, err=%v", foundViaGooglemail, err)
	}

	foundViaGmail, err := appStore.GetUserWithPermissionsByEmail(ctx, "test.googlemail.user@gmail.com")
	if err != nil || foundViaGmail.ID != u.ID {
		t.Fatalf("GetUserWithPermissionsByEmail via gmail failed: user=%v, err=%v", foundViaGmail, err)
	}

	foundViaNoDots, err := appStore.GetUserWithPermissionsByEmail(ctx, "testgooglemailuser@gmail.com")
	if err != nil || foundViaNoDots.ID != u.ID {
		t.Fatalf("GetUserWithPermissionsByEmail via no-dots gmail failed: user=%v, err=%v", foundViaNoDots, err)
	}

	// 2. Parents test: save with @googlemail.com and query with @gmail.com
	familyID := uuid.New()
	parentID := uuid.New()
	parent := models.Parent{
		ID:        parentID,
		FamilyID:  familyID,
		FirstName: "Canonical",
		LastName:  "Parent",
		Emails: models.MultiValueList{
			{
				Value:           "parent.canonical@googlemail.com",
				IdentifierEmail: true,
				AddressList:     true,
			},
		},
	}
	if err := appStore.UpdateFamilyParents(ctx, adminID, familyID, []models.Parent{parent}); err != nil {
		t.Fatalf("UpdateFamilyParents failed: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", familyID)
	}()

	// Query via @googlemail.com
	pID1, fID1, err := appStore.GetParentInfoByIdentifierEmail(ctx, "parent.canonical@googlemail.com")
	if err != nil || pID1 == nil || *pID1 != parentID || fID1 == nil || *fID1 != familyID {
		t.Fatalf("GetParentInfoByIdentifierEmail via googlemail failed: pID=%v, fID=%v, err=%v", pID1, fID1, err)
	}

	// Query via @gmail.com
	pID2, fID2, err := appStore.GetParentInfoByIdentifierEmail(ctx, "parent.canonical@gmail.com")
	if err != nil || pID2 == nil || *pID2 != parentID || fID2 == nil || *fID2 != familyID {
		t.Fatalf("GetParentInfoByIdentifierEmail via gmail failed: pID=%v, fID=%v, err=%v", pID2, fID2, err)
	}

	// Query via dotless @gmail.com
	pID3, fID3, err := appStore.GetParentInfoByIdentifierEmail(ctx, "parentcanonical@gmail.com")
	if err != nil || pID3 == nil || *pID3 != parentID || fID3 == nil || *fID3 != familyID {
		t.Fatalf("GetParentInfoByIdentifierEmail via dotless gmail failed: pID=%v, fID=%v, err=%v", pID3, fID3, err)
	}

	pFirstName, err := appStore.GetFirstNameByIdentifierEmail(ctx, "parentcanonical@gmail.com")
	if err != nil || pFirstName != "Canonical" {
		t.Fatalf("expected first name Canonical, got %q, err=%v", pFirstName, err)
	}

	// Verify ListIdentifyingEmails includes canonical gmail address
	identEmails, err := appStore.ListIdentifyingEmails(ctx)
	if err != nil {
		t.Fatalf("ListIdentifyingEmails failed: %v", err)
	}
	if _, ok := identEmails["parentcanonical@gmail.com"]; !ok {
		t.Errorf("expected ListIdentifyingEmails to contain 'parentcanonical@gmail.com', got %+v", identEmails)
	}

	// 3. Employee test: save with @googlemail.com and query with @gmail.com
	emp := models.Employee{
		FirstName:    "Canonical",
		LastName:     "Employee",
		EmployeeType: "caregiver",
		Emails: models.MultiValueList{
			{
				Value:           "emp.canonical@googlemail.com",
				IdentifierEmail: true,
				AddressList:     true,
			},
		},
	}
	createdEmp, err := appStore.CreateEmployee(ctx, adminID, emp)
	if err != nil {
		t.Fatalf("CreateEmployee failed: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM employees WHERE id = $1", createdEmp.ID)
	}()

	// Query employee via @googlemail.com
	eID1, types1, err := appStore.GetEmployeeInfoByIdentifierEmail(ctx, "emp.canonical@googlemail.com")
	if err != nil || eID1 == nil || *eID1 != createdEmp.ID || len(types1) != 1 || types1[0] != "caregiver" {
		t.Fatalf("GetEmployeeInfoByIdentifierEmail via googlemail failed: eID=%v, types=%v, err=%v", eID1, types1, err)
	}

	// Query employee via @gmail.com
	eID2, types2, err := appStore.GetEmployeeInfoByIdentifierEmail(ctx, "emp.canonical@gmail.com")
	if err != nil || eID2 == nil || *eID2 != createdEmp.ID || len(types2) != 1 || types2[0] != "caregiver" {
		t.Fatalf("GetEmployeeInfoByIdentifierEmail via gmail failed: eID=%v, types=%v, err=%v", eID2, types2, err)
	}

	// Query employee via dotless @gmail.com
	eID3, types3, err := appStore.GetEmployeeInfoByIdentifierEmail(ctx, "empcanonical@gmail.com")
	if err != nil || eID3 == nil || *eID3 != createdEmp.ID || len(types3) != 1 || types3[0] != "caregiver" {
		t.Fatalf("GetEmployeeInfoByIdentifierEmail via dotless gmail failed: eID=%v, types=%v, err=%v", eID3, types3, err)
	}

	// Verify ListEmployeeIdentifyingEmails includes canonical gmail address
	empIdentEmails, err := appStore.ListEmployeeIdentifyingEmails(ctx)
	if err != nil {
		t.Fatalf("ListEmployeeIdentifyingEmails failed: %v", err)
	}
	if _, ok := empIdentEmails["empcanonical@gmail.com"]; !ok {
		t.Errorf("expected ListEmployeeIdentifyingEmails to contain 'empcanonical@gmail.com', got %+v", empIdentEmails)
	}
}

func TestAuditLog_ChangedByEmail_IdentifierEmailParent(t *testing.T) {
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	if envURL := os.Getenv("DATABASE_URL"); envURL != "" {
		dbURL = envURL
	}
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

	parentEmail := "lara.medart@tollhaus-stuttgart.de"

	// 1. Create a family & parent with userID = uuid.Nil, but userEmail provided (as would happen with identifier-email parent)
	parent := models.Parent{
		FirstName: "Lara",
		LastName:  "Medart",
		Address:   "Teststraße 123",
		Emails: models.MultiValueList{
			{Value: parentEmail, IdentifierEmail: true},
		},
	}
	family, err := appStore.CreateFamilyWithParents(ctx, uuid.Nil, []models.Parent{parent}, "regular", parentEmail)
	if err != nil {
		t.Fatalf("CreateFamilyWithParents failed: %v", err)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, uuid.Nil, family.ID, parentEmail)
	}()

	createdParentID := family.Parents[0].ID

	// 2. Check history on parent: ChangedBy should be nil, ChangedByEmail should be parentEmail
	history, err := appStore.GetHistory(ctx, createdParentID)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(history) == 0 {
		t.Fatalf("expected at least 1 history record for parent, got 0")
	}
	found := false
	for _, l := range history {
		if l.Operation == "INSERT" {
			found = true
			if l.ChangedBy != nil {
				t.Errorf("expected ChangedBy to be nil for identifier email parent, got %v", l.ChangedBy)
			}
			if l.ChangedByEmail != parentEmail {
				t.Errorf("expected ChangedByEmail %q, got %q", parentEmail, l.ChangedByEmail)
			}
		}
	}
	if !found {
		t.Errorf("INSERT audit record not found in history")
	}

	// 3. Query audit logs with search query matching parent email
	adminUser := &models.UserWithPermissions{
		EffectivePermissions: []string{"*"},
	}
	queriedLogs, _, err := appStore.QueryAuditLogsForUser(ctx, adminUser, models.AuditLogFilter{
		Search: "lara.medart",
	})
	if err != nil {
		t.Fatalf("QueryAuditLogsForUser failed: %v", err)
	}
	if len(queriedLogs) == 0 {
		t.Fatalf("expected to find audit logs searching by %q, got none", "lara.medart")
	}
	matched := false
	for _, l := range queriedLogs {
		if l.ChangedByEmail == parentEmail {
			matched = true
			break
		}
	}
	if !matched {
		t.Errorf("expected queried logs to include record with ChangedByEmail %q", parentEmail)
	}

	// 4. Test that for an explicit user, deleting the user from `users` table does NOT erase their email in audit log
	explicitUserID := uuid.New()
	explicitEmail := "temporary-admin@example.com"
	_, err = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email) VALUES ($1, $2, $2)", explicitUserID, explicitEmail)
	if err != nil {
		t.Fatalf("failed to insert temporary user: %v", err)
	}

	job, err := appStore.CreateJob(ctx, explicitUserID, models.Job{
		Name: "Temporary Job For Audit Test",
	}, explicitEmail)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	defer func() {
		_ = appStore.DeleteJob(ctx, uuid.Nil, job.ID, explicitEmail)
	}()

	// Delete user from users table
	_, err = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", explicitUserID)
	if err != nil {
		t.Fatalf("failed to delete user: %v", err)
	}

	// Fetch history for the job: ChangedBy is now nil (due to ON DELETE SET NULL), but ChangedByEmail must still be preserved!
	jobHistory, err := appStore.GetHistory(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetHistory for job failed: %v", err)
	}
	if len(jobHistory) == 0 {
		t.Fatalf("expected job history entry, got 0")
	}
	if jobHistory[0].ChangedByEmail != explicitEmail {
		t.Errorf("expected ChangedByEmail %q to be preserved even after user was deleted from users table, got %q", explicitEmail, jobHistory[0].ChangedByEmail)
	}
}

func TestGetMyUpcomingEvents(t *testing.T) {
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

	parentID := uuid.New()
	coParentID := uuid.New()
	otherParentID := uuid.New()
	employeeID := uuid.New()

	dates := []string{
		"2098-05-10", // past
		"2098-05-12", // ambiguous
		"2098-05-14", // upcoming co-cook (earliest valid for parentID & coParentID)
		"2098-05-20", // later upcoming for parentID
		"2098-05-18", // upcoming for employeeID
	}
	defer func() {
		for _, d := range dates {
			_, _ = pool.Exec(ctx, "DELETE FROM meal_plan_from_sheets WHERE date = $1", d)
		}
	}()

	// Past date for parentID -> should be ignored
	if err := appStore.SeedTestMealPlanWithCooks(
		ctx,
		"2098-05-10",
		"Maria",
		models.MealAllergenCookList{{ID: parentID, Type: "parent", FirstName: "Maria", LastName: "Muster"}},
		"resolved",
		"Suppe", "", "",
	); err != nil {
		t.Fatalf("failed to seed past meal plan: %v", err)
	}

	// Ambiguous entry -> should be ignored even if cooks array had anything
	if err := appStore.SeedTestMealPlanWithCooks(
		ctx,
		"2098-05-12",
		"Maria",
		models.MealAllergenCookList{},
		"ambiguous",
		"Nudeln", "", "",
	); err != nil {
		t.Fatalf("failed to seed ambiguous meal plan: %v", err)
	}

	// Co-cook upcoming entry on 2098-05-14
	if err := appStore.SeedTestMealPlanWithCooks(
		ctx,
		"2098-05-14",
		"Maria & Peter",
		models.MealAllergenCookList{
			{ID: parentID, Type: "parent", FirstName: "Maria", LastName: "Muster"},
			{ID: coParentID, Type: "parent", FirstName: "Peter", LastName: "Muster"},
		},
		"resolved",
		"Lasagne", "Salat", "",
	); err != nil {
		t.Fatalf("failed to seed co-cook meal plan: %v", err)
	}

	// Later upcoming entry for parentID on 2098-05-20
	if err := appStore.SeedTestMealPlanWithCooks(
		ctx,
		"2098-05-20",
		"Maria",
		models.MealAllergenCookList{{ID: parentID, Type: "parent", FirstName: "Maria", LastName: "Muster"}},
		"resolved",
		"Reis", "", "",
	); err != nil {
		t.Fatalf("failed to seed later meal plan: %v", err)
	}

	// Upcoming entry for employeeID on 2098-05-18
	if err := appStore.SeedTestMealPlanWithCooks(
		ctx,
		"2098-05-18",
		"Alex",
		models.MealAllergenCookList{{ID: employeeID, Type: "employee", FirstName: "Alex", LastName: "Koch"}},
		"resolved",
		"Eintopf", "", "",
	); err != nil {
		t.Fatalf("failed to seed employee meal plan: %v", err)
	}

	fromDate := time.Date(2098, 5, 11, 0, 0, 0, 0, time.UTC)

	// 1. parentID gets earliest upcoming >= 2098-05-11 -> 2098-05-14
	eventsParent, err := appStore.GetMyUpcomingEvents(ctx, fromDate, &parentID, nil)
	if err != nil {
		t.Fatalf("GetMyUpcomingEvents for parent failed: %v", err)
	}
	if len(eventsParent) != 1 || eventsParent[0].Type != "cooking_duty" || eventsParent[0].Date != "2098-05-14" {
		t.Fatalf("expected [cooking_duty 2098-05-14] for parentID, got %+v", eventsParent)
	}

	// 2. On exact day 2098-05-14, still returns 2098-05-14 (today's cooking duty)
	eventsToday, err := appStore.GetMyUpcomingEvents(ctx, time.Date(2098, 5, 14, 0, 0, 0, 0, time.UTC), &parentID, nil)
	if err != nil {
		t.Fatalf("GetMyUpcomingEvents on exact day failed: %v", err)
	}
	if len(eventsToday) != 1 || eventsToday[0].Date != "2098-05-14" {
		t.Fatalf("expected [2098-05-14] on exact cooking day, got %+v", eventsToday)
	}

	// 3. Day after 2098-05-14 -> advances to 2098-05-20
	eventsAfter, err := appStore.GetMyUpcomingEvents(ctx, time.Date(2098, 5, 15, 0, 0, 0, 0, time.UTC), &parentID, nil)
	if err != nil {
		t.Fatalf("GetMyUpcomingEvents after first duty failed: %v", err)
	}
	if len(eventsAfter) != 1 || eventsAfter[0].Date != "2098-05-20" {
		t.Fatalf("expected [2098-05-20] after first cooking day passed, got %+v", eventsAfter)
	}

	// 4. coParentID also sees 2098-05-14
	eventsCoParent, err := appStore.GetMyUpcomingEvents(ctx, fromDate, &coParentID, nil)
	if err != nil {
		t.Fatalf("GetMyUpcomingEvents for coParent failed: %v", err)
	}
	if len(eventsCoParent) != 1 || eventsCoParent[0].Date != "2098-05-14" {
		t.Fatalf("expected [2098-05-14] for coParentID, got %+v", eventsCoParent)
	}

	// 5. employeeID sees 2098-05-18
	eventsEmp, err := appStore.GetMyUpcomingEvents(ctx, fromDate, nil, &employeeID)
	if err != nil {
		t.Fatalf("GetMyUpcomingEvents for employee failed: %v", err)
	}
	if len(eventsEmp) != 1 || eventsEmp[0].Date != "2098-05-18" {
		t.Fatalf("expected [2098-05-18] for employeeID, got %+v", eventsEmp)
	}

	// 6. Unrelated parent gets empty slice
	eventsOther, err := appStore.GetMyUpcomingEvents(ctx, fromDate, &otherParentID, nil)
	if err != nil {
		t.Fatalf("GetMyUpcomingEvents for unrelated parent failed: %v", err)
	}
	if len(eventsOther) != 0 {
		t.Fatalf("expected 0 events for unrelated parent, got %+v", eventsOther)
	}
}








