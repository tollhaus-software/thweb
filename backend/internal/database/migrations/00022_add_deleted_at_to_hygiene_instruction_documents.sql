-- +goose Up
ALTER TABLE hygiene_instruction_documents ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_hygiene_instruction_documents_deleted_at ON hygiene_instruction_documents(deleted_at);

-- +goose Down
DROP INDEX IF EXISTS idx_hygiene_instruction_documents_deleted_at;
ALTER TABLE hygiene_instruction_documents DROP COLUMN IF EXISTS deleted_at;
