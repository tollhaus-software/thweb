#!/usr/bin/env bash
set -e

# Repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_WORKERS="${E2E_WORKERS:-4}"
E2E_BASE_PORT="${E2E_BASE_PORT:-${E2E_PORT:-8088}}"
GENERATED_COMPOSE="$REPO_ROOT/.docker-compose.e2e-generated.yml"

cleanup() {
  echo ""
  echo "Tearing down isolated E2E docker stack..."
  if [ -f "$GENERATED_COMPOSE" ]; then
    docker compose -f "$GENERATED_COMPOSE" down -v || true
    rm -f "$GENERATED_COMPOSE"
  fi
}
# Always execute cleanup on exit (normal completion, error, or interruption)
trap cleanup EXIT

echo "Generating isolated E2E docker-compose for $E2E_WORKERS workers (base port $E2E_BASE_PORT)..."

cat <<EOF > "$GENERATED_COMPOSE"
name: thweb-e2e

services:
  db:
    extends:
      file: $REPO_ROOT/docker-compose.common.yml
      service: db

EOF

for i in $(seq 0 $((E2E_WORKERS - 1))); do
  PORT=$((E2E_BASE_PORT + i))
  cat <<EOF >> "$GENERATED_COMPOSE"
  backend-$i:
    image: thweb-backend:e2e
    build:
      context: $REPO_ROOT/backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://thweb_app:thweb_app_dev_secret@db:5432/thweb_$i?sslmode=require
      GOOGLE_CLIENT_ID: mock
      ALLOW_MOCK_AUTH: "true"
      ROLES_FILE: /etc/thweb/local_dev_roles.yaml
    volumes:
      - $REPO_ROOT/testing/certs/kiosk:/etc/kioskcerts:ro
      - $REPO_ROOT/local_dev_roles.yaml:/etc/thweb/local_dev_roles.yaml:ro
    depends_on:
      db:
        condition: service_healthy

  frontend-$i:
    image: thweb-frontend:e2e
    build:
      context: $REPO_ROOT/frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      GOOGLE_CLIENT_ID: mock
      USE_TLS: "false"
      DOMAIN_NAME: localhost
      BACKEND_HOST: backend-$i
    volumes:
      - $REPO_ROOT/testing/privacy:/etc/thweb/privacy:ro
    depends_on:
      - backend-$i

  oauth2-proxy-$i:
    image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.5
    restart: unless-stopped
    environment:
      OAUTH2_PROXY_HTTP_ADDRESS: "0.0.0.0:4180"
      OAUTH2_PROXY_UPSTREAMS: "http://frontend-$i:80"
      OAUTH2_PROXY_SKIP_AUTH_REGEX: ".*"
      OAUTH2_PROXY_PASS_ID_TOKEN: "true"
      OAUTH2_PROXY_SET_XAUTHREQUEST: "true"
      OAUTH2_PROXY_PASS_USER_HEADERS: "true"
      OAUTH2_PROXY_COOKIE_SECRET: "12345678901234567890123456789012"
      OAUTH2_PROXY_COOKIE_SAMESITE: "lax"
      OAUTH2_PROXY_CLIENT_ID: "mock"
      OAUTH2_PROXY_CLIENT_SECRET: "mock"
      OAUTH2_PROXY_EMAIL_DOMAINS: "*"
      OAUTH2_PROXY_FOOTER: '<a href="https://www.tollhaus-stuttgart.de/impressum" target="_blank" rel="noopener noreferrer">Impressum</a> · <a href="/privacy" target="_blank" rel="noopener noreferrer">Datenschutz</a>'
    ports:
      - "$PORT:4180"
    depends_on:
      - frontend-$i

EOF
done

cat <<EOF >> "$GENERATED_COMPOSE"
volumes:
  pgdata:
EOF

echo "Starting isolated E2E docker stack ($E2E_WORKERS workers)..."
docker compose -f "$GENERATED_COMPOSE" up -d --build

echo "Waiting for isolated E2E application stack ($E2E_WORKERS workers) to be ready..."
for worker in $(seq 0 $((E2E_WORKERS - 1))); do
  PORT=$((E2E_BASE_PORT + worker))
  READY=0
  for i in {1..60}; do
    if curl -sf "http://localhost:$PORT/api/me" > /dev/null 2>&1 && \
       curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
      READY=1
      break
    fi
    sleep 1
  done

  if [ "$READY" -ne 1 ]; then
    echo "Timeout waiting for E2E worker $worker stack to start on port $PORT"
    docker compose -f "$GENERATED_COMPOSE" logs "backend-$worker" "frontend-$worker" "oauth2-proxy-$worker"
    exit 1
  fi
done

echo "All $E2E_WORKERS isolated E2E worker stacks are ready!"
echo "Running Playwright tests in parallel across $E2E_WORKERS workers (base port $E2E_BASE_PORT)..."
cd "$REPO_ROOT/frontend"

TEST_EXIT_CODE=0
E2E_WORKERS="$E2E_WORKERS" E2E_BASE_PORT="$E2E_BASE_PORT" npx playwright test "$@" || TEST_EXIT_CODE=$?

exit $TEST_EXIT_CODE
