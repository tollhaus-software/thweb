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

    ALTER USER thweb_app CREATEDB;
    GRANT CONNECT ON DATABASE thweb TO thweb_app;
    GRANT USAGE, CREATE ON SCHEMA public TO thweb_app;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO thweb_app;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO thweb_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO thweb_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO thweb_app;
EOSQL

# Pre-create worker test databases (thweb_0 to thweb_15) for parallel E2E test isolation
for i in $(seq 0 15); do
    DB_NAME="thweb_$i"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE $DB_NAME OWNER thweb_app'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
        GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO thweb_app;
EOSQL
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB_NAME" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        GRANT CONNECT ON DATABASE $DB_NAME TO thweb_app;
        GRANT USAGE, CREATE ON SCHEMA public TO thweb_app;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO thweb_app;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO thweb_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO thweb_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO thweb_app;
EOSQL
done
