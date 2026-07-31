#!/bin/sh
set -e

# Generate runtime env-config.js from container environment variables
cat <<EOF > /usr/share/nginx/html/env-config.js
window.ENV = {
  GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID:-mock}"
};
EOF

# Select Nginx template based on USE_TLS
DOMAIN_NAME="${DOMAIN_NAME:-localhost}"

if [ "${USE_TLS}" = "true" ] || [ "${USE_TLS}" = "1" ]; then
  echo "Configuring Nginx for TLS (HTTPS) on port 443 with DOMAIN_NAME=${DOMAIN_NAME}..."
  envsubst '${DOMAIN_NAME}' < /etc/nginx/templates/nginx.tls.conf.template > /etc/nginx/conf.d/default.conf
else
  echo "Configuring Nginx for HTTP on port 80 with DOMAIN_NAME=${DOMAIN_NAME}..."
  envsubst '${DOMAIN_NAME}' < /etc/nginx/templates/nginx.http.conf.template > /etc/nginx/conf.d/default.conf
fi

# Execute original Nginx CMD
exec "$@"

