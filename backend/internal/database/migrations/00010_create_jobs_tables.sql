-- +goose Up
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS parent_jobs (
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_id, job_id)
);

CREATE TABLE IF NOT EXISTS employee_jobs (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (employee_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_jobs_job_id ON parent_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_employee_jobs_job_id ON employee_jobs (job_id);

-- +goose Down
DROP TABLE IF EXISTS employee_jobs CASCADE;
DROP TABLE IF EXISTS parent_jobs CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
