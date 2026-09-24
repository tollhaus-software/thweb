-- +goose Up
ALTER TABLE children ADD COLUMN IF NOT EXISTS vaccination_status_protected BYTEA;

-- +goose Down
ALTER TABLE children DROP COLUMN IF EXISTS vaccination_status_protected;
