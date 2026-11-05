-- +goose Up
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feedback_type TEXT NOT NULL,
    description TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_by_email TEXT NOT NULL DEFAULT '',
    is_kiosk BOOLEAN NOT NULL DEFAULT FALSE,
    kiosk_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS feedback CASCADE;
