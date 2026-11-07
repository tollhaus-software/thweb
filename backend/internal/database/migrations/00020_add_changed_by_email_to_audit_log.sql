-- +goose Up
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changed_by_email TEXT NOT NULL DEFAULT '';

-- Backfill existing audit logs where changed_by references a user
UPDATE audit_log a
SET changed_by_email = u.email
FROM users u
WHERE a.changed_by = u.id AND (a.changed_by_email IS NULL OR a.changed_by_email = '');

-- +goose Down
ALTER TABLE audit_log DROP COLUMN IF EXISTS changed_by_email;
