-- +goose Up
ALTER TABLE parents ADD COLUMN IF NOT EXISTS first_name_for_address_list TEXT NOT NULL DEFAULT '';
ALTER TABLE children ADD COLUMN IF NOT EXISTS first_name_for_address_list TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE parents DROP COLUMN IF EXISTS first_name_for_address_list;
ALTER TABLE children DROP COLUMN IF EXISTS first_name_for_address_list;
