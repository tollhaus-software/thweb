-- schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (Allow-list for Google Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    permissions JSONB NOT NULL DEFAULT '{}',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Families table
CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parents table
CREATE TABLE parents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    emails TEXT[] NOT NULL DEFAULT '{}',
    phones TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Children table
CREATE TABLE children (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    start_date DATE,
    exit_date DATE,
    start_group INTEGER,
    hort_start_date DATE,
    group2_start_date DATE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Log table for history tracking
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    family_id UUID REFERENCES families(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- 'family', 'parent', 'child'
    entity_id UUID NOT NULL,
    operation TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    snapshot JSONB NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for history lookup
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_family ON audit_log (family_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_parents_updated_at BEFORE UPDATE ON parents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_children_updated_at BEFORE UPDATE ON children FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Hygiene instruction events table
CREATE TABLE hygiene_belehrung_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('initial', 'recertify')),
    documentation TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_hygiene_belehrung_events_updated_at BEFORE UPDATE ON hygiene_belehrung_events FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- TH Memberships table
CREATE TABLE th_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    membership_type TEXT NOT NULL CHECK (membership_type IN ('full_member', 'supporting_member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_th_memberships_updated_at BEFORE UPDATE ON th_memberships FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Default developer user for local testing
INSERT INTO users (email, role) VALUES ('developer@example.com', 'admin') ON CONFLICT (email) DO NOTHING;

-- Seed a test family
INSERT INTO families (id) VALUES ('d3b07384-d113-4956-a5cc-987813a89001') ON CONFLICT (id) DO NOTHING;

-- Seed parent for the test family
INSERT INTO parents (id, family_id, first_name, last_name, email)
VALUES ('e4a07384-d113-4956-a5cc-987813a89002', 'd3b07384-d113-4956-a5cc-987813a89001', 'Jane', 'Doe', 'jane.doe@example.com')
ON CONFLICT (id) DO NOTHING;

-- Seed child for the test family
INSERT INTO children (id, family_id, first_name, last_name, birth_date)
VALUES ('f5b07384-d113-4956-a5cc-987813a89003', 'd3b07384-d113-4956-a5cc-987813a89001', 'Tommy', 'Doe', '2021-05-15')
ON CONFLICT (id) DO NOTHING;

