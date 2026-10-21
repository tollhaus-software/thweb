-- +goose Up
ALTER TABLE children ADD COLUMN IF NOT EXISTS familiencards JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE children DROP COLUMN IF EXISTS familiencards CASCADE;
