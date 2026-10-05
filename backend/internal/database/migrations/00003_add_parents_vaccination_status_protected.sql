-- +goose Up
ALTER TABLE parents ADD COLUMN IF NOT EXISTS vaccination_status_protected BYTEA;

INSERT INTO roles (id, name, description, permissions) VALUES
    ('mga', 'MGA', 'Masernschutzgesetz (Vaccination status management)', '["families.all.read", "families.all.write", "children.all.write", "vaccination.status.manage"]')
ON CONFLICT (id) DO UPDATE SET
    permissions = EXCLUDED.permissions;

-- +goose Down
DELETE FROM roles WHERE id = 'mga';
ALTER TABLE parents DROP COLUMN IF EXISTS vaccination_status_protected;
