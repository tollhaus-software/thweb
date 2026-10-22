-- +goose Up
CREATE TABLE IF NOT EXISTS meal_allergens (
    date DATE PRIMARY KEY,
    cook_parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
    cook_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    cook_custom_name TEXT NOT NULL DEFAULT '',
    meal_components JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'unspecified' CHECK (status IN ('unspecified', 'not_relevant', 'not_finalized', 'finalized')),
    documentation JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_meal_allergens_updated_at ON meal_allergens;
CREATE TRIGGER update_meal_allergens_updated_at BEFORE UPDATE ON meal_allergens FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- +goose Down
DROP TABLE IF EXISTS meal_allergens CASCADE;
