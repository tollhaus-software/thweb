-- +goose Up
ALTER TABLE families ADD COLUMN IF NOT EXISTS family_type TEXT NOT NULL DEFAULT 'regular' CHECK (family_type IN ('regular', 'historical_alumni'));
CREATE INDEX IF NOT EXISTS idx_families_family_type ON families (family_type);

CREATE TABLE IF NOT EXISTS contact_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL DEFAULT 'alumni_contact',
    status TEXT NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'revoked')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    channel TEXT NOT NULL DEFAULT 'email',
    notes TEXT NOT NULL DEFAULT '',
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_consents_parent ON contact_consents (parent_id);
CREATE INDEX IF NOT EXISTS idx_contact_consents_type_status ON contact_consents (consent_type, status);

DROP TRIGGER IF EXISTS update_contact_consents_updated_at ON contact_consents;
CREATE TRIGGER update_contact_consents_updated_at BEFORE UPDATE ON contact_consents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- +goose Down
DROP TABLE IF EXISTS contact_consents;
DROP INDEX IF EXISTS idx_families_family_type;
ALTER TABLE families DROP COLUMN IF EXISTS family_type;
