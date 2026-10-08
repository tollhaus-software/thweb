-- +goose Up
UPDATE users SET email = LOWER(TRIM(email));

-- +goose Down
