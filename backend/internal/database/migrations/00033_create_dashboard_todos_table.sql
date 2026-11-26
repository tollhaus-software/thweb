-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS dashboard_todos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 500,
    color TEXT NOT NULL DEFAULT 'default',
    icon TEXT NOT NULL DEFAULT '',
    on_cooking_days BOOLEAN NOT NULL DEFAULT FALSE,
    on_volunteer_absence BOOLEAN NOT NULL DEFAULT FALSE,
    on_vesper_days BOOLEAN NOT NULL DEFAULT FALSE,
    on_yellow_bag_day BOOLEAN NOT NULL DEFAULT FALSE,
    on_day_before_yellow_bag_day BOOLEAN NOT NULL DEFAULT FALSE,
    weekdays JSONB NOT NULL DEFAULT '[]'::jsonb,
    action TEXT NOT NULL DEFAULT '',
    description_markdown TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_todos_sort_order ON dashboard_todos (sort_order, name);

DROP TRIGGER IF EXISTS update_dashboard_todos_updated_at ON dashboard_todos;
CREATE TRIGGER update_dashboard_todos_updated_at BEFORE UPDATE ON dashboard_todos FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS dashboard_todos CASCADE;
-- +goose StatementEnd
