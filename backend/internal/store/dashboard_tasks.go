package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/pavolmarko/thweb-backend/internal/models"
)

// Standard dashboard task IDs and display labels
const (
	TaskYellowBinRetrieve                 = "yellow_bin_retrieve"
	TaskYellowBinPutOut                   = "yellow_bin_put_out"
	TaskCleanRefrigerator                 = "clean_refrigerator"
	TaskCleanDishwasherFilter             = "clean_dishwasher_filter"
	TaskCleanDishwasherFilterGerman       = "Spülmaschine - Filter reinigen"
	TaskCleanDishwasherFilterGermanLegacy = "Spülmaschine-Filter reinigen"
	TaskEnterAllergens                    = "enter_allergens"

	// Daily group serving tasks (Mon-Fri)
	TaskServeSmallGroup       = "serve_small_group"
	TaskServeSmallGroupName   = "Kleine Gruppe servieren"
	TaskServeSmallGroupGerman = "Kleine Gruppe servieren (auf 11:45)"
	TaskServeLargeGroup       = "serve_large_group"
	TaskServeLargeGroupName   = "Große Gruppe servieren"
	TaskServeLargeGroupGerman = "Große Gruppe servieren (auf 12:00)"
	TaskServeHort             = "serve_hort"
	TaskServeHortName         = "Hort servieren"
	TaskServeHortGerman       = "Hort servieren (meist auf 13:00)"

	// BuFDI absence tasks - German text as displayed on dashboard (task description)
	TaskStartDryer      = "Morgens: Wäsche in den Trockner"
	TaskStartWasher     = "Nachmittags: Wäsche in die Waschmaschine"
	TaskChangeDiaperBag = "Möglichst spät: Windeleimer Tüte wechseln"
	TaskFoldLaundry     = "Trockene Wäsche falten und einräumen"
	TaskFoldLaundryTypo = "Trockene Wäsche falten und einträumen"

	// Task names without time qualifiers (used in confirmation dialogs etc.)
	TaskNameStartDryer      = "Wäsche in den Trockner"
	TaskNameStartWasher     = "Wäsche in die Waschmaschine"
	TaskNameChangeDiaperBag = "Windeleimer Tüte wechseln"
	TaskNameFoldLaundry     = "Trockene Wäsche falten und einräumen"

	// Key aliases for backwards compatibility
	TaskKeyStartDryer         = "start_dryer"
	TaskKeyStartWasher        = "start_washer"
	TaskKeyChangeDiaperBag    = "change_diaper_bag"
	TaskKeyChangeDiaperBinBag = "change_diaper_bin_bag"
	TaskKeyFoldLaundry        = "fold_laundry"
)

// GetTaskAliases returns all recognized alias identifiers, names, and descriptions for a task.
func GetTaskAliases(taskTypeID string) []string {
	switch taskTypeID {
	case TaskStartDryer, TaskKeyStartDryer, TaskNameStartDryer:
		return []string{TaskStartDryer, TaskKeyStartDryer, TaskNameStartDryer}
	case TaskStartWasher, TaskKeyStartWasher, TaskNameStartWasher:
		return []string{TaskStartWasher, TaskKeyStartWasher, TaskNameStartWasher}
	case TaskChangeDiaperBag, TaskKeyChangeDiaperBag, TaskKeyChangeDiaperBinBag, TaskNameChangeDiaperBag:
		return []string{TaskChangeDiaperBag, TaskKeyChangeDiaperBag, TaskKeyChangeDiaperBinBag, TaskNameChangeDiaperBag}
	case TaskFoldLaundry, TaskFoldLaundryTypo, TaskKeyFoldLaundry:
		return []string{TaskFoldLaundry, TaskFoldLaundryTypo, TaskKeyFoldLaundry}
	case TaskCleanDishwasherFilter, TaskCleanDishwasherFilterGerman, TaskCleanDishwasherFilterGermanLegacy:
		return []string{TaskCleanDishwasherFilter, TaskCleanDishwasherFilterGerman, TaskCleanDishwasherFilterGermanLegacy}
	case TaskServeSmallGroup, TaskServeSmallGroupName, TaskServeSmallGroupGerman:
		return []string{TaskServeSmallGroup, TaskServeSmallGroupName, TaskServeSmallGroupGerman}
	case TaskServeLargeGroup, TaskServeLargeGroupName, TaskServeLargeGroupGerman:
		return []string{TaskServeLargeGroup, TaskServeLargeGroupName, TaskServeLargeGroupGerman}
	case TaskServeHort, TaskServeHortName, TaskServeHortGerman:
		return []string{TaskServeHort, TaskServeHortName, TaskServeHortGerman}
	case TaskEnterAllergens, "allergene_eintragen", "Allergene eintragen...":
		return []string{TaskEnterAllergens, "allergene_eintragen", "Allergene eintragen..."}
	default:
		return []string{taskTypeID}
	}
}

// TaskEvaluationContext provides all context information needed to evaluate task conditions.
type TaskEvaluationContext struct {
	Date                       time.Time
	DateStr                    string
	HasBufdiAbsence            bool
	IsVesperDay                bool
	IsWeekday                  bool
	IsYellowBagToday           bool
	IsYellowBagTomorrow        bool
	HasCookingScheduled        bool
	IsMealAllergensNotRelevant bool
}

// DashboardTaskDefinition defines a dashboard task and the conditions under which it should be shown.
type DashboardTaskDefinition struct {
	ID          string // Unique identifier / task key
	Name        string // Task name without qualifiers (e.g. "Wäsche in den Trockner")
	Description string // Full task description including qualifiers (e.g. "Morgens: Wäsche in den Trockner")
	OrderIndex  int    // Sort order index (e.g. 100 for allergens, 200 for start_dryer)

	OnlyIfBufdiAbsence bool
	OnlyIfVesperDay    bool
	Weekdays           []time.Weekday
	Custom             func(ctx *TaskEvaluationContext) bool
}

// Applies returns true if the task definition's conditions are met for the given context.
func (d DashboardTaskDefinition) Applies(ctx *TaskEvaluationContext) bool {
	if d.OnlyIfBufdiAbsence && !ctx.HasBufdiAbsence {
		return false
	}
	if d.OnlyIfVesperDay && !ctx.IsVesperDay {
		return false
	}
	if len(d.Weekdays) > 0 {
		matched := false
		for _, w := range d.Weekdays {
			if ctx.Date.Weekday() == w {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if d.Custom != nil && !d.Custom(ctx) {
		return false
	}
	return true
}

// TodoApplies returns true if the database DashboardTodo applies for the given evaluation context.
func TodoApplies(t models.DashboardTodo, ctx *TaskEvaluationContext) bool {
	if t.Action == "fill_allergens" && ctx.IsMealAllergensNotRelevant {
		return false
	}
	if t.OnCookingDays {
		if ctx.IsMealAllergensNotRelevant || (!ctx.IsWeekday && !ctx.HasCookingScheduled) {
			return false
		}
	}
	if t.OnLastCookingDayOfWeek && ctx.Date.Weekday() != time.Friday {
		return false
	}
	if t.OnVolunteerAbsence && !ctx.HasBufdiAbsence {
		return false
	}
	if t.OnVesperDays && !ctx.IsVesperDay {
		return false
	}
	if t.OnYellowBagDay && !ctx.IsYellowBagToday {
		return false
	}
	if t.OnDayBeforeYellowBagDay && !ctx.IsYellowBagTomorrow {
		return false
	}
	if len(t.Weekdays) > 0 {
		matched := false
		dayInt := int(ctx.Date.Weekday())
		for _, w := range t.Weekdays {
			if w == dayInt {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

// DefaultDashboardTodos returns the 12 default dashboard TODO items seeded in the database.
func DefaultDashboardTodos() []models.DashboardTodo {
	return []models.DashboardTodo{
		{
			ID:                  TaskEnterAllergens,
			Name:                "Allergene eintragen...",
			ShortName:           "Allergene eintragen...",
			SortOrder:           100,
			Color:               "allergens",
			Icon:                "",
			OnCookingDays:       true,
			Weekdays:            []int{},
			Action:              "fill_allergens",
			DescriptionMarkdown: "",
		},
		{
			ID:                  TaskKeyStartDryer,
			Name:                TaskStartDryer,
			ShortName:           TaskNameStartDryer,
			SortOrder:           200,
			Color:               "laundry",
			Icon:                "washer",
			OnVolunteerAbsence:  true,
			Weekdays:            []int{},
			Action:              "",
			DescriptionMarkdown: "",
		},
		{
			ID:                  TaskKeyFoldLaundry,
			Name:                TaskFoldLaundry,
			ShortName:           TaskNameFoldLaundry,
			SortOrder:           300,
			Color:               "laundry",
			Icon:                "washer",
			OnVolunteerAbsence:  true,
			Weekdays:            []int{},
			Action:              "",
			DescriptionMarkdown: "",
		},
		{
			ID:                  TaskServeSmallGroup,
			Name:                TaskServeSmallGroupGerman,
			ShortName:           TaskServeSmallGroupName,
			SortOrder:           350,
			Color:               "serving",
			Icon:                "",
			Weekdays:            []int{1, 2, 3, 4, 5},
			Action:              "",
			DescriptionMarkdown: "Platzhalter: Weitere Informationen zum Servieren für die Kleine Gruppe folgen in Kürze.",
		},
		{
			ID:                  TaskServeLargeGroup,
			Name:                TaskServeLargeGroupGerman,
			ShortName:           TaskServeLargeGroupName,
			SortOrder:           360,
			Color:               "serving",
			Icon:                "",
			Weekdays:            []int{1, 2, 3, 4, 5},
			Action:              "",
			DescriptionMarkdown: "Platzhalter: Weitere Informationen zum Servieren für die Große Gruppe folgen in Kürze.",
		},
		{
			ID:                  TaskServeHort,
			Name:                TaskServeHortGerman,
			ShortName:           TaskServeHortName,
			SortOrder:           370,
			Color:               "serving",
			Icon:                "",
			Weekdays:            []int{1, 2, 3, 4, 5},
			Action:              "",
			DescriptionMarkdown: "Platzhalter: Weitere Informationen zum Servieren für den Hort folgen in Kürze.",
		},
		{
			ID:                  TaskKeyStartWasher,
			Name:                TaskStartWasher,
			ShortName:           TaskNameStartWasher,
			SortOrder:           400,
			Color:               "laundry",
			Icon:                "washer",
			OnVolunteerAbsence:  true,
			Weekdays:            []int{},
			Action:              "",
			DescriptionMarkdown: "",
		},
		{
			ID:                  TaskKeyChangeDiaperBag,
			Name:                TaskChangeDiaperBag,
			ShortName:           TaskNameChangeDiaperBag,
			SortOrder:           500,
			Color:               "diaper",
			Icon:                "trash",
			OnVolunteerAbsence:  true,
			Weekdays:            []int{},
			Action:              "",
			DescriptionMarkdown: "",
		},
		{
			ID:                  TaskYellowBinRetrieve,
			Name:                "Gelbe Tonne reinholen",
			ShortName:           "Gelbe Tonne reinholen",
			SortOrder:           600,
			Color:               "yellow",
			Icon:                "trash",
			OnYellowBagDay:      true,
			Weekdays:            []int{},
			Action:              "",
			DescriptionMarkdown: "",
		},
		{
			ID:                      TaskYellowBinPutOut,
			Name:                    "Gelbe Tonne rausstellen",
			ShortName:               "Gelbe Tonne rausstellen",
			SortOrder:               650,
			Color:                   "yellow",
			Icon:                    "trash",
			OnDayBeforeYellowBagDay: true,
			Weekdays:                []int{},
			Action:                  "",
			DescriptionMarkdown:     "",
		},
		{
			ID:                  TaskCleanRefrigerator,
			Name:                "Kühlschrank reinigen",
			ShortName:           "Kühlschrank reinigen",
			SortOrder:           700,
			Color:               "refrigerator",
			Icon:                "refrigerator",
			Weekdays:            []int{5},
			Action:              "",
			DescriptionMarkdown: "",
		},
		{
			ID:                  TaskCleanDishwasherFilter,
			Name:                TaskCleanDishwasherFilterGerman,
			ShortName:           TaskCleanDishwasherFilterGerman,
			SortOrder:           800,
			Color:               "dishwasher",
			Icon:                "sparkles",
			Weekdays:            []int{1, 2, 3, 4, 5},
			Action:              "",
			DescriptionMarkdown: "",
		},
	}
}

func (s *Store) EnsureDashboardTodosTable(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS dashboard_todos (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			short_name TEXT NOT NULL DEFAULT '',
			sort_order INTEGER NOT NULL DEFAULT 500,
			color TEXT NOT NULL DEFAULT 'default',
			icon TEXT NOT NULL DEFAULT '',
			on_cooking_days BOOLEAN NOT NULL DEFAULT FALSE,
			on_last_cooking_day_of_week BOOLEAN NOT NULL DEFAULT FALSE,
			on_volunteer_absence BOOLEAN NOT NULL DEFAULT FALSE,
			on_vesper_days BOOLEAN NOT NULL DEFAULT FALSE,
			on_yellow_bag_day BOOLEAN NOT NULL DEFAULT FALSE,
			on_day_before_yellow_bag_day BOOLEAN NOT NULL DEFAULT FALSE,
			weekdays JSONB NOT NULL DEFAULT '[]'::jsonb,
			action TEXT NOT NULL DEFAULT '',
			description_markdown TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		ALTER TABLE dashboard_todos ADD COLUMN IF NOT EXISTS on_last_cooking_day_of_week BOOLEAN NOT NULL DEFAULT FALSE;
	`)
	return err
}

func (s *Store) SeedDefaultDashboardTodos(ctx context.Context) error {
	if err := s.EnsureDashboardTodosTable(ctx); err != nil {
		return err
	}
	for _, t := range DefaultDashboardTodos() {
		weekdaysJSON, err := json.Marshal(t.Weekdays)
		if err != nil {
			weekdaysJSON = []byte("[]")
		}
		_, err = s.db.Exec(ctx, `
			INSERT INTO dashboard_todos (
				id, name, short_name, sort_order, color, icon,
				on_cooking_days, on_last_cooking_day_of_week, on_volunteer_absence, on_vesper_days,
				on_yellow_bag_day, on_day_before_yellow_bag_day,
				weekdays, action, description_markdown
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10,
				$11, $12,
				$13::jsonb, $14, $15
			)
			ON CONFLICT (id) DO NOTHING
		`,
			t.ID, t.Name, t.ShortName, t.SortOrder, t.Color, t.Icon,
			t.OnCookingDays, t.OnLastCookingDayOfWeek, t.OnVolunteerAbsence, t.OnVesperDays,
			t.OnYellowBagDay, t.OnDayBeforeYellowBagDay,
			string(weekdaysJSON), t.Action, t.DescriptionMarkdown,
		)
		if err != nil {
			return fmt.Errorf("failed to seed dashboard_todo %s: %w", t.ID, err)
		}
	}
	return nil
}

func scanDashboardTodo(scanner interface {
	Scan(dest ...any) error
}) (models.DashboardTodo, error) {
	var t models.DashboardTodo
	var weekdaysRaw []byte
	err := scanner.Scan(
		&t.ID,
		&t.Name,
		&t.ShortName,
		&t.SortOrder,
		&t.Color,
		&t.Icon,
		&t.OnCookingDays,
		&t.OnLastCookingDayOfWeek,
		&t.OnVolunteerAbsence,
		&t.OnVesperDays,
		&t.OnYellowBagDay,
		&t.OnDayBeforeYellowBagDay,
		&weekdaysRaw,
		&t.Action,
		&t.DescriptionMarkdown,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err != nil {
		return t, err
	}
	if len(weekdaysRaw) > 0 {
		_ = json.Unmarshal(weekdaysRaw, &t.Weekdays)
	}
	if t.Weekdays == nil {
		t.Weekdays = []int{}
	}
	if strings.TrimSpace(t.ShortName) == "" {
		t.ShortName = t.Name
	}
	return t, nil
}

func (s *Store) ListDashboardTodos(ctx context.Context) ([]models.DashboardTodo, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			id, name, short_name, sort_order, color, icon,
			on_cooking_days, on_last_cooking_day_of_week, on_volunteer_absence, on_vesper_days,
			on_yellow_bag_day, on_day_before_yellow_bag_day,
			weekdays, action, description_markdown,
			created_at, updated_at
		FROM dashboard_todos
		ORDER BY sort_order ASC, name ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var todos []models.DashboardTodo
	for rows.Next() {
		item, err := scanDashboardTodo(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan dashboard_todo: %w", err)
		}
		todos = append(todos, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if todos == nil {
		todos = []models.DashboardTodo{}
	}
	return todos, nil
}

func (s *Store) GetDashboardTodo(ctx context.Context, id string) (*models.DashboardTodo, error) {
	row := s.db.QueryRow(ctx, `
		SELECT
			id, name, short_name, sort_order, color, icon,
			on_cooking_days, on_last_cooking_day_of_week, on_volunteer_absence, on_vesper_days,
			on_yellow_bag_day, on_day_before_yellow_bag_day,
			weekdays, action, description_markdown,
			created_at, updated_at
		FROM dashboard_todos
		WHERE id = $1
	`, id)
	item, err := scanDashboardTodo(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

func normalizeDashboardTodoInput(todo *models.DashboardTodo) error {
	todo.Name = strings.TrimSpace(todo.Name)
	if todo.Name == "" {
		return fmt.Errorf("name is required")
	}
	todo.ShortName = strings.TrimSpace(todo.ShortName)
	if todo.ShortName == "" {
		todo.ShortName = todo.Name
	}
	todo.Color = strings.ToLower(strings.TrimSpace(todo.Color))
	validColors := map[string]bool{
		"default":      true,
		"allergens":    true,
		"yellow":       true,
		"refrigerator": true,
		"dishwasher":   true,
		"serving":      true,
		"laundry":      true,
		"diaper":       true,
	}
	if !validColors[todo.Color] {
		todo.Color = "default"
	}
	todo.Icon = strings.ToLower(strings.TrimSpace(todo.Icon))
	todo.Action = strings.ToLower(strings.TrimSpace(todo.Action))
	if todo.Action != "" && todo.Action != "fill_allergens" {
		return fmt.Errorf("unsupported action: %s", todo.Action)
	}
	seenWeekdays := map[int]bool{}
	cleanWeekdays := []int{}
	for _, w := range todo.Weekdays {
		if w >= 0 && w <= 6 && !seenWeekdays[w] {
			seenWeekdays[w] = true
			cleanWeekdays = append(cleanWeekdays, w)
		}
	}
	todo.Weekdays = cleanWeekdays
	return nil
}

func (s *Store) CreateDashboardTodo(ctx context.Context, actorUserID uuid.UUID, actorEmail string, todo models.DashboardTodo) (*models.DashboardTodo, error) {
	todo.ID = strings.TrimSpace(todo.ID)
	if todo.ID == "" {
		return nil, fmt.Errorf("id is required")
	}
	if err := normalizeDashboardTodoInput(&todo); err != nil {
		return nil, err
	}
	if err := s.EnsureDashboardTodosTable(ctx); err != nil {
		return nil, err
	}
	existing, err := s.GetDashboardTodo(ctx, todo.ID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("dashboard todo id already exists: %s", todo.ID)
	}
	if todo.SortOrder == 0 {
		todo.SortOrder = 500
	}

	weekdaysJSON, err := json.Marshal(todo.Weekdays)
	if err != nil {
		return nil, err
	}

	row := s.db.QueryRow(ctx, `
		INSERT INTO dashboard_todos (
			id, name, short_name, sort_order, color, icon,
			on_cooking_days, on_last_cooking_day_of_week, on_volunteer_absence, on_vesper_days,
			on_yellow_bag_day, on_day_before_yellow_bag_day,
			weekdays, action, description_markdown
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10,
			$11, $12,
			$13::jsonb, $14, $15
		)
		RETURNING
			id, name, short_name, sort_order, color, icon,
			on_cooking_days, on_last_cooking_day_of_week, on_volunteer_absence, on_vesper_days,
			on_yellow_bag_day, on_day_before_yellow_bag_day,
			weekdays, action, description_markdown,
			created_at, updated_at
	`,
		todo.ID, todo.Name, todo.ShortName, todo.SortOrder, todo.Color, todo.Icon,
		todo.OnCookingDays, todo.OnLastCookingDayOfWeek, todo.OnVolunteerAbsence, todo.OnVesperDays,
		todo.OnYellowBagDay, todo.OnDayBeforeYellowBagDay,
		string(weekdaysJSON), todo.Action, todo.DescriptionMarkdown,
	)
	created, err := scanDashboardTodo(row)
	if err != nil {
		return nil, fmt.Errorf("failed to create dashboard_todo: %w", err)
	}

	return &created, nil
}

func (s *Store) UpdateDashboardTodo(ctx context.Context, actorUserID uuid.UUID, actorEmail string, id string, todo models.DashboardTodo) (*models.DashboardTodo, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("id is required")
	}
	if err := normalizeDashboardTodoInput(&todo); err != nil {
		return nil, err
	}
	existing, err := s.GetDashboardTodo(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("dashboard todo not found")
	}

	weekdaysJSON, err := json.Marshal(todo.Weekdays)
	if err != nil {
		return nil, err
	}

	row := s.db.QueryRow(ctx, `
		UPDATE dashboard_todos
		SET
			name = $2,
			short_name = $3,
			sort_order = $4,
			color = $5,
			icon = $6,
			on_cooking_days = $7,
			on_last_cooking_day_of_week = $8,
			on_volunteer_absence = $9,
			on_vesper_days = $10,
			on_yellow_bag_day = $11,
			on_day_before_yellow_bag_day = $12,
			weekdays = $13::jsonb,
			action = $14,
			description_markdown = $15,
			updated_at = NOW()
		WHERE id = $1
		RETURNING
			id, name, short_name, sort_order, color, icon,
			on_cooking_days, on_last_cooking_day_of_week, on_volunteer_absence, on_vesper_days,
			on_yellow_bag_day, on_day_before_yellow_bag_day,
			weekdays, action, description_markdown,
			created_at, updated_at
	`,
		id, todo.Name, todo.ShortName, todo.SortOrder, todo.Color, todo.Icon,
		todo.OnCookingDays, todo.OnLastCookingDayOfWeek, todo.OnVolunteerAbsence, todo.OnVesperDays,
		todo.OnYellowBagDay, todo.OnDayBeforeYellowBagDay,
		string(weekdaysJSON), todo.Action, todo.DescriptionMarkdown,
	)
	updated, err := scanDashboardTodo(row)
	if err != nil {
		return nil, fmt.Errorf("failed to update dashboard_todo: %w", err)
	}

	return &updated, nil
}

func (s *Store) DeleteDashboardTodo(ctx context.Context, actorUserID uuid.UUID, actorEmail string, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("id is required")
	}
	existing, err := s.GetDashboardTodo(ctx, id)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("dashboard todo not found")
	}

	_, err = s.db.Exec(ctx, `DELETE FROM dashboard_todos WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete dashboard_todo: %w", err)
	}

	return nil
}
