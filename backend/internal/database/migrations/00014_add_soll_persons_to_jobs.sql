-- +goose Up
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS soll_persons INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE jobs DROP COLUMN IF EXISTS soll_persons;
