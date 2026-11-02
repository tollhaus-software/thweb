-- +goose Up
ALTER TABLE meal_allergens ADD COLUMN IF NOT EXISTS cooks JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE meal_allergens
SET cooks = CASE
    WHEN cook_parent_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type', 'parent', 'id', cook_parent_id::text))
    WHEN cook_employee_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type', 'employee', 'id', cook_employee_id::text))
    ELSE '[]'::jsonb
END
WHERE cooks = '[]'::jsonb AND (cook_parent_id IS NOT NULL OR cook_employee_id IS NOT NULL);

-- +goose Down
ALTER TABLE meal_allergens DROP COLUMN IF EXISTS cooks;
