-- +goose Up
ALTER TABLE families ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE families DROP COLUMN IF EXISTS notes;
