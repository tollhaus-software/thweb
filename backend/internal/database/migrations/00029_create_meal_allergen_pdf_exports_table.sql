-- +goose Up
CREATE TABLE IF NOT EXISTS meal_allergen_pdf_exports (
    cooking_date DATE PRIMARY KEY,
    content_hash TEXT NOT NULL,
    drive_file_id TEXT NOT NULL DEFAULT '',
    drive_path TEXT NOT NULL DEFAULT '',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS meal_allergen_pdf_exports CASCADE;
