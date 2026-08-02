# PostgreSQL Connection & Security Guide

This document explains how PostgreSQL is hosted, how network connections between the Go backend application and PostgreSQL are secured using TLS, and how credentials and migrations are managed.

---

## 1. Containerized PostgreSQL Architecture

PostgreSQL runs as a dedicated Docker container (`thweb-db` / `postgres:15-alpine`).

* **Network Isolation**: In production, the database container is unpublished to the host machine and resides strictly within the internal private Docker network (`thweb_default`). It is only accessible to the Go backend container (`thweb-backend`).
* **Persistent Data**: Database data files are persisted across container restarts using a Docker named volume (`pgdata`).

---

## 2. TLS Connection Security

All connections between the Go application and PostgreSQL are encrypted using **TLS (SSL)** to prevent eavesdropping and data tampering.

### A. Local Testing Configuration
For local development and testing:
* **Certificates**: Self-signed testing certificates are located in [`testing/certs/postgres/`](file:///home/pmarko/thweb-root/thweb/testing/certs/postgres/):
  - `server.crt` (Public TLS Certificate, CN=`db`)
  - `server.key` (Private TLS Key, `chmod 0600`)
  - `ca.crt` (Root CA Certificate)
* **PostgreSQL Server SSL**: The `db` service is started with SSL enabled:
  ```yaml
  command: ["postgres", "-c", "ssl=on", "-c", "ssl_cert_file=/var/lib/postgresql/server.crt", "-c", "ssl_key_file=/var/lib/postgresql/server.key"]
  ```
* **Go Backend Connection URI**:
  ```yaml
  DATABASE_URL: postgres://postgres:postgres@db:5432/thweb?sslmode=require
  ```

### B. Production Configuration
In production (or when connecting to managed cloud databases like Exoscale DB or AWS RDS):
* **Managed TLS**: Production database nodes provide TLS certificates.
* **`sslmode=require` / `sslmode=verify-full`**: Enforces TLS encryption across the wire. When using custom CAs, the CA root certificate path is passed via `sslrootcert`:
  ```bash
  DATABASE_URL="postgres://user:password@db-host:5432/thweb?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca.crt"
  ```

---

## 3. Schema & Versioned Migrations (Goose)

Database schema initialization and versioned migrations are managed using **`pressly/goose`** embedded directly into the Go backend executable via `//go:embed`.

* **Embedded Migrations**: Migration files live in [`backend/internal/database/migrations/*.sql`](file:///home/pmarko/thweb-root/thweb/backend/internal/database/migrations/) (e.g. `00001_initial_schema.sql`). They are compiled directly into the binary at build time.
* **Automatic Execution**: When the Go backend container starts, `database.ApplySchemaMigrations` runs `goose.UpContext`. Goose tracks applied migrations in a `goose_db_version` table in PostgreSQL and automatically executes any new `.sql` migrations.
* **No Host File Mounts**: Docker Compose setup requires no host file mounts for SQL schemas.
