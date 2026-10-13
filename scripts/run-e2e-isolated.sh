#!/usr/bin/env bash
set -e

# Repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_PORT="${E2E_PORT:-8088}"
COMPOSE_FILE="$REPO_ROOT/docker-compose.e2e.yml"

cleanup() {
  echo ""
  echo "Tearing down isolated E2E docker stack..."
  docker compose -f "$COMPOSE_FILE" down -v
}
# Always execute cleanup on exit (normal completion, error, or interruption)
trap cleanup EXIT

echo "Starting isolated E2E docker stack on port $E2E_PORT..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo "Waiting for isolated E2E application stack to be ready..."
READY=0
for i in {1..60}; do
  if curl -sf "http://localhost:$E2E_PORT/api/me" > /dev/null 2>&1 && \
     curl -sf "http://localhost:$E2E_PORT/" > /dev/null 2>&1; then
    echo "Isolated E2E stack is ready!"
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "Timeout waiting for E2E stack to start on port $E2E_PORT"
  docker compose -f "$COMPOSE_FILE" logs
  exit 1
fi

echo "Running Playwright tests against http://localhost:$E2E_PORT..."
cd "$REPO_ROOT/frontend"

TEST_EXIT_CODE=0
BASE_URL="http://localhost:$E2E_PORT" npx playwright test "$@" || TEST_EXIT_CODE=$?

exit $TEST_EXIT_CODE
