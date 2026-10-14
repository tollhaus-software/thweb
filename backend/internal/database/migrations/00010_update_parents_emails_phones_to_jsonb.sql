-- +goose Up
ALTER TABLE parents DROP COLUMN emails;
ALTER TABLE parents ADD COLUMN emails JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE parents DROP COLUMN phones;
ALTER TABLE parents ADD COLUMN phones JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE parents DROP COLUMN emails;
ALTER TABLE parents ADD COLUMN emails TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE parents DROP COLUMN phones;
ALTER TABLE parents ADD COLUMN phones TEXT[] NOT NULL DEFAULT '{}';
