# Agent Guidelines for thweb

This document provides essential instructions, workflows, and quality standards for Antigravity (agy) agents and contributors working in this codebase.

---

## 1. Mandatory Quality Checks After Every Modification

Whenever you modify code in this repository, you **MUST** ensure the following checks pass before concluding your task:

### 1.1 ESLint Check
Run ESLint to verify that no new lint errors or formatting issues exist:
```bash
cd frontend && npm run lint
```
*Requirement*: Must exit with code 0 (zero errors).

### 1.2 TypeScript Compilation & Frontend Build
Verify type checks and build validity:
```bash
cd frontend && npm run build
```
*Requirement*: Must exit with code 0 without type or build errors.

### 1.3 Playwright E2E Tests
E2E test files are located in `frontend/e2e/` (e.g., `case1-*.spec.ts` through `case42-*.spec.ts`).
You must ensure that relevant (and full) E2E test suites pass:
```bash
# Run specific E2E test file(s) against local running stack
cd frontend && npx playwright test e2e/<test-name>.spec.ts

# Run the complete test suite against local running stack
cd frontend && npx playwright test

# Or run in parallel using isolated stacks (recommended for full suite runs)
./scripts/run-e2e-isolated.sh
```
*Requirement*: All executed tests must pass.

### 1.4 Backend Tests (When Backend is Modified)
If any Go backend files (`backend/`) are touched:
```bash
cd backend && go test ./...
```
*Requirement*: All unit tests must pass.

---

## 2. Architecture & Codebase Overview

- **Frontend**:
  - Located in `frontend/`. Built with React, TypeScript, and Vite.
  - Core application views and tabs live in `frontend/src/App.tsx`.
  - CSS styles are in `frontend/src/App.css` and component-specific stylesheets.
  - Responsive mobile breakpoint is defined in `frontend/src/constants/breakpoints.ts` and injected into CSS by Vite as `__MOBILE_BREAKPOINT__` (768px).
- **Backend**:
  - Located in `backend/`. Written in Go with `chi` router and PostgreSQL store.
- **Docker Stack**:
  - The local development environment is orchestrated via Docker Compose (`docker-compose.yml` / `docker-compose.common.yml`).
  - Containers: `thweb-frontend`, `thweb-backend`, `thweb-oauth2-proxy`, `thweb-db`.

---

## 3. How to Run & Verify E2E Tests

### 3.1 Running Against Existing Local Stack
When the Docker Compose stack is already running:
1. Rebuild and restart the frontend container to apply your changes to the served assets:
   ```bash
   docker compose up -d --build frontend
   ```
2. Run Playwright tests against `http://localhost:80`:
   ```bash
   cd frontend && npx playwright test
   ```

### 3.2 Running in Isolated Environment (Parallel Test Execution)
The repository provides `scripts/run-e2e-isolated.sh` to run Playwright tests in parallel across isolated Docker stacks without interfering with the local development stack:

```bash
# Run from repository root:
./scripts/run-e2e-isolated.sh

# Or from the frontend directory:
npm run test:e2e:isolated
```

#### How Parallel Execution Works:
- **Dedicated Worker Stacks**: The script automatically generates a standalone Docker Compose stack running $N$ parallel workers (`E2E_WORKERS`, default is `4`).
- **Full Database & Service Isolation**: Each worker ($i = 0 \dots N-1$) runs its own backend (`backend-$i`), frontend (`frontend-$i`), and OAuth2 proxy (`oauth2-proxy-$i`), connecting to its own isolated PostgreSQL database (`thweb_$i`). This prevents test cross-talk, data races, and flakiness.
- **Dynamic Port Allocation**: Proxies bind to consecutive host ports starting at `E2E_BASE_PORT` (default `8088`, so ports `8088`, `8089`, `8090`, `8091`).
- **Readiness Wait & Automatic Cleanup**: The script waits for all worker health checks to succeed before triggering Playwright, and registers an exit trap (`trap cleanup EXIT`) to cleanly shut down the stack (`docker compose down -v`) and remove generated compose configs on completion, failure, or cancellation.

#### Customizing Parallelism and Ports:
You can configure parallel worker count and base port using environment variables:
- `E2E_WORKERS`: Number of parallel workers/stacks (default: `4`, databases `thweb_0` to `thweb_15` are pre-provisioned).
- `E2E_BASE_PORT`: Base port for the workers (default: `8088`).

```bash
# Example: Run 8 workers in parallel on base port 9000
E2E_WORKERS=8 E2E_BASE_PORT=9000 ./scripts/run-e2e-isolated.sh
```

#### Passing Arguments to Playwright:
All arguments passed to `run-e2e-isolated.sh` are forwarded directly to `npx playwright test`:
```bash
# Run a single spec file in the isolated parallel environment:
./scripts/run-e2e-isolated.sh e2e/case1-memberships.spec.ts

# Filter tests by grep pattern:
./scripts/run-e2e-isolated.sh -g "allergies"

# Pass any standard Playwright flags:
./scripts/run-e2e-isolated.sh --headed --trace on
```

---

## 4. Key UI & Layout Conventions

- **familiesOverview Tab**:
  - Switches between a desktop "table" view (> 768px) and a mobile adaptive "card" view (<= 768px).
