-- +goose Up
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value)
VALUES ('bufdi_name', 'BuFDI')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS system_settings CASCADE;
