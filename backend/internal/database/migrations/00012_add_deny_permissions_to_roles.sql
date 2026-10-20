-- +goose Up
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deny_permissions JSONB NOT NULL DEFAULT '[]';

-- +goose Down
ALTER TABLE roles DROP COLUMN IF EXISTS deny_permissions;
