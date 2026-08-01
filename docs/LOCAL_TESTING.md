# Local Testing Guide

## Prerequisites
Install Docker Compose: https://docs.docker.com/compose/install/

## Run

docker compose --env-file .env.mock up --build

This will:
- Build all containers
- Run a docker container with the Postgres database
- Run a docker container with the backend go server
- Run a docker container with a nginx server serving the frontend files and forwarding API requests to the backend
- Run a docker container with oauth2-proxy in testing mode

.env.mock contains mock settings that don't require real secrets / client IDs, e.g. for Google Auth.

Now you can access oauth2-proxy and through it the application on localhost:80

# Manual building
You can build / run the backend / frontend manually for testing / easier debugging.

## Build the Backend
```bash
cd backend
go build ./...
ALLOW_MOCK_AUTH=true GOOGLE_CLIENT_ID=mock go run cmd/server/main.go
```

*(Optional)* If you need to override the default database connection URL:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable GOOGLE_CLIENT_ID=mock go run cmd/server/main.go
```

## Run the Frontend
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
