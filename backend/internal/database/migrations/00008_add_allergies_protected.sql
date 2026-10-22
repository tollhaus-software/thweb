-- +goose Up
ALTER TABLE children ADD COLUMN IF NOT EXISTS allergies_protected BYTEA;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS allergies_protected BYTEA;

-- +goose Down
ALTER TABLE employees DROP COLUMN IF EXISTS allergies_protected;
ALTER TABLE children DROP COLUMN IF EXISTS allergies_protected;
