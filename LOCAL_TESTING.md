# Local Testing Guide

Follow these steps to run the application locally.

## 1. Start the Database
The project includes a `docker-compose.yml` file to spin up a PostgreSQL instance and automatically initialize the schema.

From the root directory, run:
```bash
docker compose up -d
```

---

## 2. Run the Backend
The Go backend requires a `GOOGLE_CLIENT_ID` environment variable. For local testing, we can use `mock`.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Start the server:
   ```bash
   GOOGLE_CLIENT_ID=mock go run cmd/server/main.go
   ```

*(Optional)* If you need to override the default database connection URL:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable GOOGLE_CLIENT_ID=mock go run cmd/server/main.go
```

---

## 3. Run the Frontend
The frontend is a React + Vite application.

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

Access the frontend via the URL printed in your terminal (usually `http://localhost:5173`).
