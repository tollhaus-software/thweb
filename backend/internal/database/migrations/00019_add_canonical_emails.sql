-- +goose Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS canonical_email TEXT;

UPDATE users 
SET canonical_email = CASE 
    WHEN lower(trim(email)) ~ '@(gmail|googlemail)\.com$' THEN
        replace(regexp_replace(lower(trim(email)), '@(gmail|googlemail)\.com$', ''), '.', '') || '@gmail.com'
    ELSE
        lower(trim(email))
END
WHERE canonical_email IS NULL OR canonical_email = '';

ALTER TABLE users ALTER COLUMN canonical_email SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_canonical_email ON users(canonical_email);

-- Update parents.emails JSONB array to include canonical_value
UPDATE parents
SET emails = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'object' THEN 
                    elem || jsonb_build_object(
                        'canonical_value', 
                        CASE 
                            WHEN lower(trim(COALESCE(elem->>'value', ''))) ~ '@(gmail|googlemail)\.com$' THEN
                                replace(regexp_replace(lower(trim(COALESCE(elem->>'value', ''))), '@(gmail|googlemail)\.com$', ''), '.', '') || '@gmail.com'
                            ELSE
                                lower(trim(COALESCE(elem->>'value', '')))
                        END
                    )
                WHEN jsonb_typeof(elem) = 'string' THEN
                    jsonb_build_object(
                        'value', elem #>> '{}',
                        'canonical_value', 
                        CASE 
                            WHEN lower(trim(elem #>> '{}')) ~ '@(gmail|googlemail)\.com$' THEN
                                replace(regexp_replace(lower(trim(elem #>> '{}')), '@(gmail|googlemail)\.com$', ''), '.', '') || '@gmail.com'
                            ELSE
                                lower(trim(elem #>> '{}'))
                        END,
                        'address_list', true,
                        'identifier_email', false
                    )
                ELSE elem
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(emails) AS elem
)
WHERE emails IS NOT NULL AND jsonb_array_length(emails) > 0;

-- Update employees.emails JSONB array to include canonical_value
UPDATE employees
SET emails = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'object' THEN 
                    elem || jsonb_build_object(
                        'canonical_value', 
                        CASE 
                            WHEN lower(trim(COALESCE(elem->>'value', ''))) ~ '@(gmail|googlemail)\.com$' THEN
                                replace(regexp_replace(lower(trim(COALESCE(elem->>'value', ''))), '@(gmail|googlemail)\.com$', ''), '.', '') || '@gmail.com'
                            ELSE
                                lower(trim(COALESCE(elem->>'value', '')))
                        END
                    )
                WHEN jsonb_typeof(elem) = 'string' THEN
                    jsonb_build_object(
                        'value', elem #>> '{}',
                        'canonical_value', 
                        CASE 
                            WHEN lower(trim(elem #>> '{}')) ~ '@(gmail|googlemail)\.com$' THEN
                                replace(regexp_replace(lower(trim(elem #>> '{}')), '@(gmail|googlemail)\.com$', ''), '.', '') || '@gmail.com'
                            ELSE
                                lower(trim(elem #>> '{}'))
                        END,
                        'address_list', true,
                        'identifier_email', false
                    )
                ELSE elem
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(emails) AS elem
)
WHERE emails IS NOT NULL AND jsonb_array_length(emails) > 0;

-- +goose Down
DROP INDEX IF EXISTS idx_users_canonical_email;
ALTER TABLE users DROP COLUMN IF EXISTS canonical_email;

UPDATE parents
SET emails = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'object' THEN elem - 'canonical_value'
                ELSE elem
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(emails) AS elem
)
WHERE emails IS NOT NULL AND jsonb_array_length(emails) > 0;

UPDATE employees
SET emails = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'object' THEN elem - 'canonical_value'
                ELSE elem
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(emails) AS elem
)
WHERE emails IS NOT NULL AND jsonb_array_length(emails) > 0;
