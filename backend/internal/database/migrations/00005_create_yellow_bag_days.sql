-- +goose Up
CREATE TABLE IF NOT EXISTS yellow_bag_days (
    date DATE PRIMARY KEY
);

CREATE OR REPLACE VIEW yellow_bag_dates AS SELECT * FROM yellow_bag_days;

-- +goose Down
DROP VIEW IF EXISTS yellow_bag_dates;
DROP TABLE IF EXISTS yellow_bag_days;
