#!/bin/sh
set -eu

SNIPPET="/etc/nginx/snippets/trv-route-merge-ai.conf"
mkdir -p /etc/nginx/snippets

escape_nginx_dquoted() {
  # Minimal escaping for proxy_set_header "...";
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_disabled_snippet() {
  cat >"$SNIPPET" <<'EOF'
location ^~ /trv-azure-openai/ {
  default_type application/json;
  return 503 '{"error":"trv-azure-openai-proxy-disabled","hint":"Set TRV_ENABLE_ROUTE_MERGE_AI_PROXY=true and TRV_AZURE_OPENAI_ORIGIN on the pod (see DEPLOYMENT.md)."}';
}
EOF
}

if [ "${TRV_ENABLE_ROUTE_MERGE_AI_PROXY:-}" != "true" ]; then
  write_disabled_snippet
  exit 0
fi

ORIGIN_RAW="${TRV_AZURE_OPENAI_ORIGIN:-}"
if [ -z "$ORIGIN_RAW" ]; then
  echo "traffic-route-viz: TRV_ENABLE_ROUTE_MERGE_AI_PROXY=true but TRV_AZURE_OPENAI_ORIGIN is empty" >&2
  exit 1
fi

# Accept either https://host or https://host/openai/... — proxy only needs scheme+host[:port]
UPSTREAM_ORIGIN="$(printf '%s' "$ORIGIN_RAW" | sed -E 's#^(https?://[^/]+).*$#\1#')"
UPSTREAM_HOST="$(printf '%s' "$UPSTREAM_ORIGIN" | sed -E 's#^https?://##; s#/.*##')"

if [ -z "${AZURE_API_KEY:-}" ] && [ -z "${AZURE_OPENAI_API_KEY:-}" ]; then
  echo "traffic-route-viz: TRV_ENABLE_ROUTE_MERGE_AI_PROXY=true but neither AZURE_API_KEY nor AZURE_OPENAI_API_KEY is set" >&2
  exit 1
fi

AUTH_FILE="/etc/nginx/snippets/trv-route-merge-ai-auth.conf"
if [ -n "${AZURE_API_KEY:-}" ]; then
  AZ_ESC="$(escape_nginx_dquoted "$AZURE_API_KEY")"
  printf 'proxy_set_header Authorization "Bearer %s";\n' "$AZ_ESC" >"$AUTH_FILE"
else
  KEY_ESC="$(escape_nginx_dquoted "$AZURE_OPENAI_API_KEY")"
  printf 'proxy_set_header api-key "%s";\n' "$KEY_ESC" >"$AUTH_FILE"
fi
chmod 600 "$AUTH_FILE" 2>/dev/null || true

cat >"$SNIPPET" <<EOF
location ^~ /trv-azure-openai/ {
  rewrite ^/trv-azure-openai(.*)\$ \$1 break;
  proxy_pass ${UPSTREAM_ORIGIN};
  proxy_http_version 1.1;
  proxy_ssl_server_name on;
  proxy_set_header Host ${UPSTREAM_HOST};
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_connect_timeout 30s;
  proxy_send_timeout 300s;
  proxy_read_timeout 300s;
  include ${AUTH_FILE};
}
EOF
