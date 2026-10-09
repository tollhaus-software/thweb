-- +goose Up
ALTER TABLE yellow_bag_days ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE VIEW yellow_bag_dates AS SELECT * FROM yellow_bag_days;

-- +goose Down
ALTER TABLE yellow_bag_days DROP COLUMN IF EXISTS fetched_at;
CREATE OR REPLACE VIEW yellow_bag_dates AS SELECT * FROM yellow_bag_days;
