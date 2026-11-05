-- +goose Up
CREATE TABLE IF NOT EXISTS completed_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_date DATE NOT NULL,
    task_type_id TEXT NOT NULL,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_by_email TEXT NOT NULL DEFAULT '',
    is_kiosk BOOLEAN NOT NULL DEFAULT FALSE,
    kiosk_name TEXT NOT NULL DEFAULT '',
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_completed_tasks_date_type UNIQUE (task_date, task_type_id)
);

CREATE INDEX IF NOT EXISTS idx_completed_tasks_date ON completed_tasks (task_date);

-- +goose Down
DROP TABLE IF EXISTS completed_tasks CASCADE;
