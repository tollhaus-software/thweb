-- +goose Up
ALTER TABLE families ADD COLUMN IF NOT EXISTS mentor_family_id UUID REFERENCES families(id) ON DELETE SET NULL;
ALTER TABLE families ADD COLUMN IF NOT EXISTS mentor_parent_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_families_mentor_family_id ON families(mentor_family_id);

-- +goose Down
DROP INDEX IF EXISTS idx_families_mentor_family_id;
ALTER TABLE families DROP COLUMN IF EXISTS mentor_parent_ids;
ALTER TABLE families DROP COLUMN IF EXISTS mentor_family_id;
