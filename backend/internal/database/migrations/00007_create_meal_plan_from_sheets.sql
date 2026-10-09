-- +goose Up
CREATE TABLE IF NOT EXISTS meal_plan_from_sheets (
    date DATE PRIMARY KEY,
    fetched_at TIMESTAMPTZ NOT NULL,
    cook_name TEXT NOT NULL DEFAULT '',
    food_component_1 TEXT NOT NULL DEFAULT '',
    food_component_2 TEXT NOT NULL DEFAULT '',
    food_component_3 TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_from_sheets_date ON meal_plan_from_sheets (date);

-- +goose Down
DROP TABLE IF EXISTS meal_plan_from_sheets;
