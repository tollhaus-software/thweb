-- +goose Up
-- +goose StatementBegin
ALTER TABLE dashboard_todos
    ADD COLUMN IF NOT EXISTS on_last_cooking_day_of_week BOOLEAN NOT NULL DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE dashboard_todos
    DROP COLUMN IF EXISTS on_last_cooking_day_of_week;
-- +goose StatementEnd
