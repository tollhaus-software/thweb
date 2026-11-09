-- +goose Up
CREATE TABLE IF NOT EXISTS hygiene_instruction_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_size BIGINT NOT NULL,
    file_data BYTEA NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'upload', -- 'upload' or 'google_drive'
    source_url TEXT NOT NULL DEFAULT '',
    uploaded_by TEXT NOT NULL DEFAULT '',
    requires_immediate_recertification BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hygiene_instruction_active 
ON hygiene_instruction_documents (is_active) 
WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_hygiene_instruction_documents_updated_at ON hygiene_instruction_documents;
CREATE TRIGGER update_hygiene_instruction_documents_updated_at 
BEFORE UPDATE ON hygiene_instruction_documents 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add optional document_id reference to hygiene_belehrung_events table
ALTER TABLE hygiene_belehrung_events 
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES hygiene_instruction_documents(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE hygiene_belehrung_events DROP COLUMN IF EXISTS document_id;
DROP TABLE IF EXISTS hygiene_instruction_documents CASCADE;
