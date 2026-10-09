-- +goose Up
ALTER TABLE meal_plan_from_sheets ADD COLUMN IF NOT EXISTS cook_name TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE meal_plan_from_sheets DROP COLUMN IF EXISTS cook_name;
