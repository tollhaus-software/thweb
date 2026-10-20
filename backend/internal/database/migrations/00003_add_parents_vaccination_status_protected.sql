-- +goose Up
ALTER TABLE parents ADD COLUMN IF NOT EXISTS vaccination_status_protected BYTEA;

-- +goose Down
ALTER TABLE parents DROP COLUMN IF EXISTS vaccination_status_protected;
