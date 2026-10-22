-- +goose Up
CREATE TABLE IF NOT EXISTS data_encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose TEXT NOT NULL CHECK (purpose IN ('vaccination', 'allergies')),
    kms_key_path TEXT NOT NULL,
    encrypted_dek BYTEA NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retired_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dek_active_per_purpose
ON data_encryption_keys (purpose)
WHERE is_active = true;

-- Overwrite/clear any existing v0x01 vaccination blobs
UPDATE parents SET vaccination_status_protected = NULL WHERE vaccination_status_protected IS NOT NULL;
UPDATE children SET vaccination_status_protected = NULL WHERE vaccination_status_protected IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_dek_active_per_purpose;
DROP TABLE IF EXISTS data_encryption_keys;
