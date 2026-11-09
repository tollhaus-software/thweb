-- +goose Up
ALTER TABLE hygiene_instruction_documents DROP COLUMN IF EXISTS requires_immediate_recertification;

-- +goose Down
ALTER TABLE hygiene_instruction_documents ADD COLUMN IF NOT EXISTS requires_immediate_recertification BOOLEAN NOT NULL DEFAULT FALSE;
