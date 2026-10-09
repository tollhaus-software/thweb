package store

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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

	// Tasks for Friday: yellow_bin_retrieve and clean_coffe_machine
	hasRetrieve := false
	hasCoffee := false
	for _, task := range briefFriday.TasksAndInfo {
		if task == "yellow_bin_retrieve" {
			hasRetrieve = true
		}
		if task == "clean_coffe_machine" {
			hasCoffee = true
		}
	}
	if !hasRetrieve {
		t.Errorf("expected 'yellow_bin_retrieve' in tasks, got: %+v", briefFriday.TasksAndInfo)
	}
	if !hasCoffee {
		t.Errorf("expected 'clean_coffe_machine' in tasks, got: %+v", briefFriday.TasksAndInfo)
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

	// Tasks for Thursday: yellow_bin_put_out, but NOT clean_coffe_machine or yellow_bin_retrieve
	hasPutOut := false
	for _, task := range briefThursday.TasksAndInfo {
		if task == "yellow_bin_put_out" {
			hasPutOut = true
		}
		if task == "clean_coffe_machine" || task == "yellow_bin_retrieve" {
			t.Errorf("unexpected task on Thursday: %s", task)
		}
	}
	if !hasPutOut {
		t.Errorf("expected 'yellow_bin_put_out' in tasks for Thursday, got: %+v", briefThursday.TasksAndInfo)
	}
}
