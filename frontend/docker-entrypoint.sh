#!/bin/sh
set -e

# Generate runtime env-config.js from container environment variables
cat <<EOF > /usr/share/nginx/html/env-config.js
window.ENV = {
  GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID:-mock}"
};
EOF

# Execute original Nginx CMD
exec "$@"
