-- +goose Up
CREATE TABLE IF NOT EXISTS volunteer_absences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('bufdi')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_volunteer_absences_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_absences_type_dates ON volunteer_absences (type, start_date, end_date);

DROP TRIGGER IF EXISTS update_volunteer_absences_updated_at ON volunteer_absences;
CREATE TRIGGER update_volunteer_absences_updated_at BEFORE UPDATE ON volunteer_absences FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- +goose Down
DROP TRIGGER IF EXISTS update_volunteer_absences_updated_at ON volunteer_absences;
DROP TABLE IF EXISTS volunteer_absences CASCADE;
