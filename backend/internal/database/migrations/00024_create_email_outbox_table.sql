-- +goose Up
CREATE TABLE IF NOT EXISTS email_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'notification',
    created_by TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT NOT NULL DEFAULT '',
    sent_at TIMESTAMPTZ,
    provider_message_id TEXT NOT NULL DEFAULT '',
    locked_at TIMESTAMPTZ,
    locked_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status_next_attempt ON email_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created_at ON email_outbox (created_at DESC);

DROP TRIGGER IF EXISTS update_email_outbox_updated_at ON email_outbox;
CREATE TRIGGER update_email_outbox_updated_at BEFORE UPDATE ON email_outbox FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'thweb_email_worker') THEN
        GRANT SELECT, UPDATE, DELETE ON TABLE email_outbox TO thweb_email_worker;
    END IF;
END
$$;
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS update_email_outbox_updated_at ON email_outbox;
DROP TABLE IF EXISTS email_outbox CASCADE;
