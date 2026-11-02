-- +goose Up
CREATE TABLE IF NOT EXISTS meal_allergens_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cooking_date DATE NOT NULL,
    operation TEXT NOT NULL,
    before_snapshot JSONB,
    after_snapshot JSONB NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_by_email TEXT NOT NULL DEFAULT '',
    is_kiosk BOOLEAN NOT NULL DEFAULT FALSE,
    kiosk_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_allergens_history_cooking_date ON meal_allergens_history (cooking_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_allergens_history_created_at ON meal_allergens_history (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS meal_allergens_history CASCADE;
