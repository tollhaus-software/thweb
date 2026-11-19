-- +goose Up
ALTER TABLE volunteer_absences ADD COLUMN IF NOT EXISTS bufdi_name TEXT NOT NULL DEFAULT '';

UPDATE volunteer_absences
SET bufdi_name = COALESCE(
    (SELECT NULLIF(TRIM(value), '') FROM system_settings WHERE key = 'bufdi_name'),
    'BuFDI'
)
WHERE TRIM(bufdi_name) = '';

-- +goose Down
ALTER TABLE volunteer_absences DROP COLUMN IF EXISTS bufdi_name;
