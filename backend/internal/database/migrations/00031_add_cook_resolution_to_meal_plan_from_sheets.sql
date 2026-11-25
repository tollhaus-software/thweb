-- +goose Up
ALTER TABLE meal_plan_from_sheets
    ADD COLUMN IF NOT EXISTS cooks JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS cook_resolution_status TEXT NOT NULL DEFAULT 'empty'
        CHECK (cook_resolution_status IN ('empty', 'ignored', 'resolved', 'ambiguous', 'unrecognized')),
    ADD COLUMN IF NOT EXISTS cook_resolution_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS unresolved_notified_cook_name TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE meal_plan_from_sheets
    DROP COLUMN IF EXISTS unresolved_notified_cook_name,
    DROP COLUMN IF EXISTS cook_resolution_details,
    DROP COLUMN IF EXISTS cook_resolution_status,
    DROP COLUMN IF EXISTS cooks;
