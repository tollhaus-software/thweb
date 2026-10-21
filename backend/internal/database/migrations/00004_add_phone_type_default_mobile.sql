-- +goose Up
-- Default existing phone numbers without a type to "mobile"
UPDATE parents
SET phones = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'string' THEN 
                    jsonb_build_object('value', elem #>> '{}', 'address_list', true, 'type', 'mobile')
                WHEN elem ? 'type' AND elem->>'type' IS NOT NULL AND elem->>'type' != '' THEN 
                    elem
                ELSE 
                    elem || '{"type": "mobile"}'::jsonb
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(phones) AS elem
)
WHERE phones IS NOT NULL AND jsonb_array_length(phones) > 0;

UPDATE employees
SET phones = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'string' THEN 
                    jsonb_build_object('value', elem #>> '{}', 'address_list', true, 'type', 'mobile')
                WHEN elem ? 'type' AND elem->>'type' IS NOT NULL AND elem->>'type' != '' THEN 
                    elem
                ELSE 
                    elem || '{"type": "mobile"}'::jsonb
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(phones) AS elem
)
WHERE phones IS NOT NULL AND jsonb_array_length(phones) > 0;

-- +goose Down
UPDATE parents
SET phones = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'object' THEN elem - 'type'
                ELSE elem
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(phones) AS elem
)
WHERE phones IS NOT NULL AND jsonb_array_length(phones) > 0;

UPDATE employees
SET phones = (
    SELECT COALESCE(
        jsonb_agg(
            CASE 
                WHEN jsonb_typeof(elem) = 'object' THEN elem - 'type'
                ELSE elem
            END
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(phones) AS elem
)
WHERE phones IS NOT NULL AND jsonb_array_length(phones) > 0;
