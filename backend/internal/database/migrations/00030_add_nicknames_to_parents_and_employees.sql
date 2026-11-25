-- +goose Up
ALTER TABLE parents ADD COLUMN IF NOT EXISTS nicknames JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nicknames JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE parents DROP COLUMN IF EXISTS nicknames;
ALTER TABLE employees DROP COLUMN IF EXISTS nicknames;
