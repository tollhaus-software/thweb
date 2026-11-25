-- schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles table for access control
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    permissions JSONB NOT NULL DEFAULT '[]',
    deny_permissions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table (Allow-list for Google Auth)
-- (users of the application)
-- Currently the system is matching against e-mail.
-- Emails are stored normalized in lowercase (preserving dots).
-- For Google Auth it could be better to match against "sub"
-- (subject id) to support user e-mail changes.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    canonical_email TEXT UNIQUE NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-Roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Families table
-- Note a family doesn't have a name at the moment - how it's displayed on the
-- UI is currently defined by the `parents` that belong to that family.
CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mentor_family_id UUID REFERENCES families(id) ON DELETE SET NULL,
    mentor_parent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    family_type TEXT NOT NULL DEFAULT 'regular' CHECK (family_type IN ('regular', 'historical_alumni')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_families_mentor_family_id ON families(mentor_family_id);
CREATE INDEX IF NOT EXISTS idx_families_family_type ON families(family_type);

-- Parents table
CREATE TABLE IF NOT EXISTS parents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    first_name_for_address_list TEXT NOT NULL DEFAULT '',
    nicknames JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_name TEXT NOT NULL,
    emails JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- phones: JSONB array of objects [{ "value": "...", "type": "mobile"|"landline"|"work", "address_list": bool }]
    phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    vaccination_status_protected BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Children table
CREATE TABLE IF NOT EXISTS children (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    first_name_for_address_list TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    vaccination_status_protected BYTEA,
    allergies_protected BYTEA,
    familiencards JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Log table for history tracking
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    family_id UUID REFERENCES families(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- 'family', 'parent', 'child', 'hygiene_event', 'th_membership', 'child_group_change', 'contact_consent'
    entity_id UUID NOT NULL,
    operation TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    -- JSON snapshot of the entity model:
    --   INSERT: before = null, after = new state
    --   UPDATE: before = old state, after = new state
    --   DELETE: before = old state, after = null
    before_snapshot JSONB,
    after_snapshot JSONB,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_by_email TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for history lookup
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_family ON audit_log (family_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_id ON audit_log (created_at DESC, id DESC);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_parents_updated_at ON parents;
CREATE TRIGGER update_parents_updated_at BEFORE UPDATE ON parents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_children_updated_at ON children;
CREATE TRIGGER update_children_updated_at BEFORE UPDATE ON children FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Hygiene instruction documents table
CREATE TABLE IF NOT EXISTS hygiene_instruction_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_size BIGINT NOT NULL,
    file_data BYTEA NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'upload',
    source_url TEXT NOT NULL DEFAULT '',
    uploaded_by TEXT NOT NULL DEFAULT '',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hygiene_instruction_active ON hygiene_instruction_documents (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_hygiene_instruction_documents_deleted_at ON hygiene_instruction_documents (deleted_at);

DROP TRIGGER IF EXISTS update_hygiene_instruction_documents_updated_at ON hygiene_instruction_documents;
CREATE TRIGGER update_hygiene_instruction_documents_updated_at BEFORE UPDATE ON hygiene_instruction_documents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Hygiene instruction events table
CREATE TABLE IF NOT EXISTS hygiene_belehrung_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('initial', 'recertify')),
    documentation TEXT NOT NULL DEFAULT '',
    document_id UUID REFERENCES hygiene_instruction_documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_hygiene_belehrung_events_updated_at ON hygiene_belehrung_events;
CREATE TRIGGER update_hygiene_belehrung_events_updated_at BEFORE UPDATE ON hygiene_belehrung_events FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- TH Memberships table
CREATE TABLE IF NOT EXISTS th_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    membership_type TEXT NOT NULL CHECK (membership_type IN ('full_member', 'supporting_member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_th_memberships_updated_at ON th_memberships;
CREATE TRIGGER update_th_memberships_updated_at BEFORE UPDATE ON th_memberships FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Contact Consents table
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

-- Children group changes table
-- Target group: 0 = exit, 1 = Kleine Gruppe, 2 = Grosse Gruppe, 3 = Hort
CREATE TABLE IF NOT EXISTS children_group_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    change_date DATE NOT NULL,
    target_group INTEGER NOT NULL, -- 0 = exit, 1 = Kleine Gruppe, 2 = Grosse Gruppe, 3 = Hort
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_children_group_changes_child_date UNIQUE (child, change_date)
);

DROP TRIGGER IF EXISTS update_children_group_changes_updated_at ON children_group_changes;
CREATE TRIGGER update_children_group_changes_updated_at BEFORE UPDATE ON children_group_changes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_children_group_changes_child ON children_group_changes(child);

-- Yellow bag days table
CREATE TABLE IF NOT EXISTS yellow_bag_days (
    date DATE PRIMARY KEY,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW yellow_bag_dates AS SELECT * FROM yellow_bag_days;

-- Meal plan from sheets table
CREATE TABLE IF NOT EXISTS meal_plan_from_sheets (
    date DATE PRIMARY KEY,
    fetched_at TIMESTAMPTZ NOT NULL,
    cook_name TEXT NOT NULL DEFAULT '',
    cooks JSONB NOT NULL DEFAULT '[]'::jsonb,
    cook_resolution_status TEXT NOT NULL DEFAULT 'empty' CHECK (cook_resolution_status IN ('empty', 'ignored', 'resolved', 'ambiguous', 'unrecognized')),
    cook_resolution_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    unresolved_notified_cook_name TEXT NOT NULL DEFAULT '',
    food_component_1 TEXT NOT NULL DEFAULT '',
    food_component_2 TEXT NOT NULL DEFAULT '',
    food_component_3 TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_from_sheets_date ON meal_plan_from_sheets (date);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    nicknames JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_name TEXT NOT NULL,
    employee_type TEXT NOT NULL CHECK (employee_type IN ('caregiver', 'cook', 'bufdi')),
    emails JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- phones: JSONB array of objects [{ "value": "...", "type": "mobile"|"landline"|"work", "address_list": bool }]
    phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    address TEXT NOT NULL DEFAULT '',
    is_kinderschutzbeauftragter BOOLEAN NOT NULL DEFAULT FALSE,
    allergies_protected BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_employees_type ON employees (employee_type);

-- Centralized Data Encryption Keys (DEK) store for envelope encryption
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

-- Meal allergens documentation per calendar day
CREATE TABLE IF NOT EXISTS meal_allergens (
    date DATE PRIMARY KEY,
    cook_parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
    cook_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    cook_custom_name TEXT NOT NULL DEFAULT '',
    cooks JSONB NOT NULL DEFAULT '[]'::jsonb,
    meal_components JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'unspecified' CHECK (status IN ('unspecified', 'not_relevant', 'not_finalized', 'finalized')),
    documentation JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_meal_allergens_updated_at ON meal_allergens;
CREATE TRIGGER update_meal_allergens_updated_at BEFORE UPDATE ON meal_allergens FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Meal allergens history table
CREATE TABLE IF NOT EXISTS meal_allergens_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cooking_date DATE NOT NULL,
    operation TEXT NOT NULL,
    before_snapshot JSONB,
    after_snapshot JSONB NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_by_email TEXT NOT NULL DEFAULT '',
    is_kiosk BOOLEAN NOT NULL DEFAULT FALSE,
    kiosk_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_allergens_history_cooking_date ON meal_allergens_history (cooking_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_allergens_history_created_at ON meal_allergens_history (created_at DESC);

-- Sync state for exported finalized meal allergen documentation PDFs in Google Drive
CREATE TABLE IF NOT EXISTS meal_allergen_pdf_exports (
    cooking_date DATE PRIMARY KEY,
    content_hash TEXT NOT NULL,
    drive_file_id TEXT NOT NULL DEFAULT '',
    drive_path TEXT NOT NULL DEFAULT '',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    roles JSONB NOT NULL DEFAULT '[]',
    soll_persons INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Association between parents and jobs
CREATE TABLE IF NOT EXISTS parent_jobs (
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_id, job_id)
);

-- Association between employees and jobs
CREATE TABLE IF NOT EXISTS employee_jobs (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (employee_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_jobs_job_id ON parent_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_employee_jobs_job_id ON employee_jobs (job_id);

-- Completed dashboard tasks
CREATE TABLE IF NOT EXISTS completed_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_date DATE NOT NULL,
    task_type_id TEXT NOT NULL,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_by_email TEXT NOT NULL DEFAULT '',
    is_kiosk BOOLEAN NOT NULL DEFAULT FALSE,
    kiosk_name TEXT NOT NULL DEFAULT '',
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_completed_tasks_date_type UNIQUE (task_date, task_type_id)
);

CREATE INDEX IF NOT EXISTS idx_completed_tasks_date ON completed_tasks (task_date);

-- Email Outbox queue table
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

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'thweb_email_worker') THEN
        GRANT SELECT, UPDATE, DELETE ON TABLE email_outbox TO thweb_email_worker;
    END IF;
END
$$;

-- Volunteer Absences table
CREATE TABLE IF NOT EXISTS volunteer_absences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('bufdi')),
    bufdi_name TEXT NOT NULL DEFAULT '',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_volunteer_absences_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_absences_type_dates ON volunteer_absences (type, start_date, end_date);

DROP TRIGGER IF EXISTS update_volunteer_absences_updated_at ON volunteer_absences;
CREATE TRIGGER update_volunteer_absences_updated_at BEFORE UPDATE ON volunteer_absences FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- System Settings table
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value)
VALUES ('bufdi_name', 'BuFDI')
ON CONFLICT (key) DO NOTHING;

-- Calendar Events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL CHECK (event_type IN (
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
    )),
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    created_by_email TEXT NOT NULL DEFAULT '',
    updated_by_email TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_calendar_events_dates CHECK (end_date >= start_date),
    CONSTRAINT check_calendar_events_custom_title CHECK (event_type <> 'custom' OR btrim(title) <> ''),
    CONSTRAINT check_calendar_events_times CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (
            start_time IS NOT NULL
            AND (end_time IS NULL OR end_date > start_date OR end_time >= start_time)
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_dates ON calendar_events (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events (event_type);

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();






