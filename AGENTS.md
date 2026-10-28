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
E2E test files are located in `frontend/e2e/` (e.g., `case1-*.spec.ts` through `case23-*.spec.ts`).
You must ensure that relevant (and full) E2E test suites pass:
```bash
# Run specific E2E test file(s)
cd frontend && npx playwright test e2e/<test-name>.spec.ts

# Run the complete test suite
cd frontend && npx playwright test
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

### 3.2 Running in Isolated Environment
To run tests in a standalone isolated Docker stack:
```bash
./scripts/run-e2e-isolated.sh
```
This script provisions an isolated Docker stack on port 8088, runs Playwright, and cleans up afterwards.

---

## 4. Key UI & Layout Conventions

- **familiesOverview Tab**:
  - Switches between a desktop "table" view (> 768px) and a mobile adaptive "card" view (<= 768px).
