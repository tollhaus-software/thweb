-- +goose Up
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'custom',
        'schliesszeit',
        'schliesszeit_halbtags',
        'ferien',
        'paedagogischer_tag',
        'teamausflug',
        'ea_kleine_gruppe',
        'ea_grosse_gruppe',
        'ea_hort',
        'ea_gesamt',
        'ea_gesamt_and_mgv',
        'putz_we',
        'bau_we',
        'garten_we',
        'laternenfest',
        'weihnachtsfeier',
        'sommerfest'
    )),
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    created_by_email TEXT NOT NULL DEFAULT '',
    updated_by_email TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_calendar_events_dates CHECK (end_date >= start_date),
    CONSTRAINT check_calendar_events_custom_title CHECK (event_type <> 'custom' OR btrim(title) <> ''),
    CONSTRAINT check_calendar_events_times CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (
            start_time IS NOT NULL
            AND (end_time IS NULL OR end_date > start_date OR end_time >= start_time)
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_dates ON calendar_events (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events (event_type);

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- +goose Down
DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
DROP TABLE IF EXISTS calendar_events CASCADE;
