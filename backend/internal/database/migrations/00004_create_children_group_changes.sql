-- +goose Up
-- Drop old date and group columns from children table
ALTER TABLE children DROP COLUMN IF EXISTS start_date;
ALTER TABLE children DROP COLUMN IF EXISTS group2_start_date;
ALTER TABLE children DROP COLUMN IF EXISTS hort_start_date;
ALTER TABLE children DROP COLUMN IF EXISTS exit_date;
ALTER TABLE children DROP COLUMN IF EXISTS start_group;

-- Create children_group_changes table
-- Target group: 0 = exit, 1 = Kleine Gruppe, 2 = Grosse Gruppe, 3 = Hort
CREATE TABLE IF NOT EXISTS children_group_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    change_date DATE NOT NULL,
    target_group INTEGER NOT NULL, -- 0 = exit, 1 = Kleine Gruppe, 2 = Grosse Gruppe, 3 = Hort
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_children_group_changes_child_date UNIQUE (child, change_date)
);

DROP TRIGGER IF EXISTS update_children_group_changes_updated_at ON children_group_changes;
CREATE TRIGGER update_children_group_changes_updated_at BEFORE UPDATE ON children_group_changes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_children_group_changes_child ON children_group_changes(child);

-- +goose Down
DROP TABLE IF EXISTS children_group_changes CASCADE;

ALTER TABLE children ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE children ADD COLUMN IF NOT EXISTS group2_start_date DATE;
ALTER TABLE children ADD COLUMN IF NOT EXISTS hort_start_date DATE;
ALTER TABLE children ADD COLUMN IF NOT EXISTS exit_date DATE;
ALTER TABLE children ADD COLUMN IF NOT EXISTS start_group INTEGER;
