package store

import (
	"time"
)

// Standard dashboard task IDs and display labels
const (
	TaskYellowBinRetrieve = "yellow_bin_retrieve"
	TaskYellowBinPutOut   = "yellow_bin_put_out"
	TaskCleanRefrigerator                 = "clean_refrigerator"
	TaskCleanDishwasherFilter             = "clean_dishwasher_filter"
	TaskCleanDishwasherFilterGerman       = "Spülmaschine - Filter reinigen"
	TaskCleanDishwasherFilterGermanLegacy = "Spülmaschine-Filter reinigen"
	TaskEnterAllergens                    = "enter_allergens"

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
// When adding a new task, specify its ID, Name, Description, and any applicable conditions below.
type DashboardTaskDefinition struct {
	ID          string // Unique identifier / task key
	Name        string // Task name without qualifiers (e.g. "Wäsche in den Trockner")
	Description string // Full task description including qualifiers (e.g. "Morgens: Wäsche in den Trockner")
	OrderIndex  int    // Sort order index (e.g. 100 for allergens, 200 for start_dryer)

	// Conditions:
	// OnlyIfBufdiAbsence: if true, task is only displayed if BuFDI has an active absence on that day.
	OnlyIfBufdiAbsence bool

	// OnlyIfVesperDay: if true, task is only displayed on Vesper days (Wednesday and Thursday).
	OnlyIfVesperDay bool

	// Weekdays: if non-empty, task is only displayed on the specified weekdays (e.g. time.Friday).
	Weekdays []time.Weekday

	// Custom: optional custom condition function for complex task prerequisites.
	Custom func(ctx *TaskEvaluationContext) bool
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

// DashboardTasks is the centralized registry of all tasks evaluated for the dashboard.
// When adding a new task, add it here and configure any conditions (such as OnlyIfBufdiAbsence or OnlyIfVesperDay).
var DashboardTasks = []DashboardTaskDefinition{
	// Meal allergens recording task:
	{
		ID:         TaskEnterAllergens,
		OrderIndex: 100,
		Custom: func(ctx *TaskEvaluationContext) bool {
			return !ctx.IsMealAllergensNotRelevant && (ctx.IsWeekday || ctx.HasCookingScheduled)
		},
	},

	// BuFDI absence tasks:
	{
		ID:                 TaskStartDryer,
		Name:               TaskNameStartDryer,
		Description:        TaskStartDryer,
		OrderIndex:         200,
		OnlyIfBufdiAbsence: true,
	},
	{
		ID:                 TaskFoldLaundry,
		Name:               TaskNameFoldLaundry,
		Description:        TaskFoldLaundry,
		OrderIndex:         300,
		OnlyIfBufdiAbsence: true,
	},
	{
		ID:                 TaskStartWasher,
		Name:               TaskNameStartWasher,
		Description:        TaskStartWasher,
		OrderIndex:         400,
		OnlyIfBufdiAbsence: true,
	},
	{
		ID:                 TaskChangeDiaperBag,
		Name:               TaskNameChangeDiaperBag,
		Description:        TaskChangeDiaperBag,
		OrderIndex:         500,
		OnlyIfBufdiAbsence: true,
	},

	// Waste management & weekly tasks:
	{
		ID:         TaskYellowBinRetrieve,
		OrderIndex: 600,
		Custom: func(ctx *TaskEvaluationContext) bool {
			return ctx.IsYellowBagToday
		},
	},
	{
		ID:         TaskYellowBinPutOut,
		OrderIndex: 650,
		Custom: func(ctx *TaskEvaluationContext) bool {
			return ctx.IsYellowBagTomorrow
		},
	},
	{
		ID:         TaskCleanRefrigerator,
		OrderIndex: 700,
		Weekdays:   []time.Weekday{time.Friday},
	},
	{
		ID:          TaskCleanDishwasherFilter,
		Name:        TaskCleanDishwasherFilterGerman,
		Description: TaskCleanDishwasherFilterGerman,
		OrderIndex:  800,
		Weekdays: []time.Weekday{
			time.Monday,
			time.Tuesday,
			time.Wednesday,
			time.Thursday,
			time.Friday,
		},
	},
}
