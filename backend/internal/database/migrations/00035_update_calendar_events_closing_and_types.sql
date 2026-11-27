-- +goose Up
-- +goose StatementBegin
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS is_facility_closed BOOLEAN NOT NULL DEFAULT FALSE;

DELETE FROM calendar_events WHERE event_type IN ('teamausflug', 'schliesszeit_halbtags');

UPDATE calendar_events
SET is_facility_closed = TRUE
WHERE event_type IN ('schliesszeit', 'paedagogischer_tag');

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE calendar_events
    ADD CONSTRAINT calendar_events_event_type_check CHECK (event_type IN (
        'custom',
        'schliesszeit',
        'ferien',
        'paedagogischer_tag',
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
    ));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE calendar_events
    ADD CONSTRAINT calendar_events_event_type_check CHECK (event_type IN (
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
    ));

ALTER TABLE calendar_events
    DROP COLUMN IF EXISTS is_facility_closed;
-- +goose StatementEnd
