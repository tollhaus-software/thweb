-- +goose Up
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_id ON audit_log (created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_audit_log_created_at_id;
