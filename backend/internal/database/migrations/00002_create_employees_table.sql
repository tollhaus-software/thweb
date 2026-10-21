-- +goose Up
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    employee_type TEXT NOT NULL CHECK (employee_type IN ('caregiver', 'cook', 'bufdi')),
    emails JSONB NOT NULL DEFAULT '[]'::jsonb,
    phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    address TEXT NOT NULL DEFAULT '',
    is_kinderschutzbeauftragter BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_employees_type ON employees (employee_type);

-- +goose Down
DROP TABLE IF EXISTS employees CASCADE;
