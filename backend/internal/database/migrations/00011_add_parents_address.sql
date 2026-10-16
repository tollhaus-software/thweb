-- +goose Up
ALTER TABLE parents ADD COLUMN address TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE parents DROP COLUMN IF EXISTS address;
