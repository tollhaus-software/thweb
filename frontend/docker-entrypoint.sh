#!/bin/sh
set -e

# Detect injected logo if APP_LOGO_URL is not set
if [ -z "${APP_LOGO_URL}" ]; then
  if [ -n "${APP_LOGO_FILE}" ] && [ -f "${APP_LOGO_FILE}" ]; then
    EXT="${APP_LOGO_FILE##*.}"
    cp "${APP_LOGO_FILE}" "/usr/share/nginx/html/logo.${EXT}"
    APP_LOGO_URL="/logo.${EXT}"
  elif [ -f "/etc/thweb/logo.svg" ]; then
    cp /etc/thweb/logo.svg /usr/share/nginx/html/logo.svg
    APP_LOGO_URL="/logo.svg"
  elif [ -f "/etc/thweb/logo.png" ]; then
    cp /etc/thweb/logo.png /usr/share/nginx/html/logo.png
    APP_LOGO_URL="/logo.png"
  elif [ -f "/usr/share/nginx/html/logo.svg" ]; then
    APP_LOGO_URL="/logo.svg"
  elif [ -f "/usr/share/nginx/html/logo.png" ]; then
    APP_LOGO_URL="/logo.png"
  elif [ -f "/usr/share/nginx/html/logo.webp" ]; then
    APP_LOGO_URL="/logo.webp"
  fi
fi

# Detect injected favicon if APP_FAVICON_URL is not set
if [ -z "${APP_FAVICON_URL}" ]; then
  if [ -n "${APP_FAVICON_FILE}" ] && [ -f "${APP_FAVICON_FILE}" ]; then
    EXT="${APP_FAVICON_FILE##*.}"
    cp "${APP_FAVICON_FILE}" "/usr/share/nginx/html/favicon-custom.${EXT}"
    APP_FAVICON_URL="/favicon-custom.${EXT}"
  elif [ -f "/etc/thweb/favicon.svg" ]; then
    cp /etc/thweb/favicon.svg /usr/share/nginx/html/favicon-custom.svg
    APP_FAVICON_URL="/favicon-custom.svg"
  elif [ -f "/etc/thweb/favicon.ico" ]; then
    cp /etc/thweb/favicon.ico /usr/share/nginx/html/favicon-custom.ico
    APP_FAVICON_URL="/favicon-custom.ico"
  elif [ -f "/etc/thweb/favicon.png" ]; then
    cp /etc/thweb/favicon.png /usr/share/nginx/html/favicon-custom.png
    APP_FAVICON_URL="/favicon-custom.png"
  elif [ -f "/usr/share/nginx/html/favicon.ico" ]; then
    APP_FAVICON_URL="/favicon.ico"
  elif [ -f "/usr/share/nginx/html/favicon.png" ]; then
    APP_FAVICON_URL="/favicon.png"
  elif [ -f "/usr/share/nginx/html/favicon-custom.svg" ]; then
    APP_FAVICON_URL="/favicon-custom.svg"
  fi
fi

# Update index.html title tag if APP_TITLE is set
if [ -n "${APP_TITLE}" ]; then
  ESCAPED_TITLE=$(printf '%s\n' "${APP_TITLE}" | sed -e 's/[\\/&]/\\&/g')
  sed -i "s/<title>.*<\/title>/<title>${ESCAPED_TITLE}<\/title>/g" /usr/share/nginx/html/index.html
fi

# Update index.html favicon link if APP_FAVICON_URL is set
if [ -n "${APP_FAVICON_URL}" ]; then
  ESCAPED_FAVICON=$(printf '%s\n' "${APP_FAVICON_URL}" | sed -e 's/[\\/&]/\\&/g')
  sed -i "s|<link rel=\"icon\"[^>]*>|<link rel=\"icon\" href=\"${ESCAPED_FAVICON}\" />|g" /usr/share/nginx/html/index.html
fi

SAFE_APP_TITLE=$(printf '%s' "${APP_TITLE:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')
SAFE_APP_LOGO_URL=$(printf '%s' "${APP_LOGO_URL:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')
SAFE_APP_FAVICON_URL=$(printf '%s' "${APP_FAVICON_URL:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')

# Generate runtime env-config.js from container environment variables
cat <<EOF > /usr/share/nginx/html/env-config.js
window.ENV = Object.assign({
  GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID:-mock}",
  GOOGLE_PROTECTED_DATA_CLIENT_ID: "${GOOGLE_PROTECTED_DATA_CLIENT_ID:-mock-protected-data}"
}, window.ENV || {});
EOF

if [ -n "${SAFE_APP_TITLE}" ]; then
  cat <<EOF >> /usr/share/nginx/html/env-config.js
window.ENV.APP_TITLE = "${SAFE_APP_TITLE}";
EOF
fi

if [ -n "${SAFE_APP_LOGO_URL}" ]; then
  cat <<EOF >> /usr/share/nginx/html/env-config.js
window.ENV.APP_LOGO_URL = "${SAFE_APP_LOGO_URL}";
EOF
fi

if [ -n "${SAFE_APP_FAVICON_URL}" ]; then
  cat <<EOF >> /usr/share/nginx/html/env-config.js
window.ENV.APP_FAVICON_URL = "${SAFE_APP_FAVICON_URL}";
EOF
fi

# Select Nginx template based on USE_TLS
DOMAIN_NAME="${DOMAIN_NAME:-localhost}"

if [ "${USE_TLS}" = "true" ] || [ "${USE_TLS}" = "1" ]; then
  echo "Configuring Nginx for TLS (HTTPS) on port 443 with DOMAIN_NAME=${DOMAIN_NAME}..."
  envsubst '${DOMAIN_NAME} ${PROXY_SHARED_SECRET}' < /etc/nginx/templates/nginx.tls.conf.template > /etc/nginx/conf.d/default.conf
else
  echo "Configuring Nginx for HTTP on port 80 with DOMAIN_NAME=${DOMAIN_NAME}..."
  envsubst '${DOMAIN_NAME} ${PROXY_SHARED_SECRET}' < /etc/nginx/templates/nginx.http.conf.template > /etc/nginx/conf.d/default.conf
fi

# Execute original Nginx CMD
exec "$@"
