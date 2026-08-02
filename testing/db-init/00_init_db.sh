#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    DO \$$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'thweb_app') THEN
            CREATE USER thweb_app WITH PASSWORD '${THWEB_DB_APP_PASSWORD:-thweb_app_dev_secret}';
        ELSE
            ALTER USER thweb_app WITH PASSWORD '${THWEB_DB_APP_PASSWORD:-thweb_app_dev_secret}';
        END IF;
    END
    \$$;

    GRANT CONNECT ON DATABASE thweb TO thweb_app;
    GRANT USAGE, CREATE ON SCHEMA public TO thweb_app;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO thweb_app;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO thweb_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO thweb_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO thweb_app;
EOSQL
