#!/bin/sh
set -eu

# 同源 `/trv-azure-openai` 反向代理：启用条件与 upstream 均来自运行时 config.json（见 routeMergeAi），
# 不在此重复配置 endpoint。鉴权来自环境变量（K8s 中由 Secret 注入 AZURE_OPENAI_API_KEY 或 AZURE_API_KEY）。
# 可选：TRV_RUNTIME_CONFIG_PATH 覆盖 config.json 路径（默认与静态站点一致）。

CONFIG="${TRV_RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/config.json}"
SNIPPET="/etc/nginx/snippets/trv-route-merge-ai.conf"
mkdir -p /etc/nginx/snippets

escape_nginx_dquoted() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_disabled_snippet() {
  reason="$1"
  echo "traffic-route-viz: /trv-azure-openai proxy DISABLED — ${reason}. Main site still starts; fix config/secret then restart pod. See DEPLOYMENT.md." >&2
  cat >"$SNIPPET" <<'EOF'
location ^~ /trv-azure-openai/ {
  default_type application/json;
  return 503 '{"error":"trv-azure-openai-proxy-disabled","hint":"Set routeMergeAi.enabled, useSameOriginProxy, baseUrl in config.json and AZURE_OPENAI_API_KEY or AZURE_API_KEY in the environment (see DEPLOYMENT.md)."}';
}
EOF
}

if ! command -v jq >/dev/null 2>&1; then
  echo "traffic-route-viz: jq is required for route-merge AI proxy bootstrap" >&2
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  write_disabled_snippet "config file missing (${CONFIG})"
  exit 0
fi

if ! jq empty "$CONFIG" 2>/dev/null; then
  echo "traffic-route-viz: invalid JSON: $CONFIG" >&2
  exit 1
fi

ENABLED=$(jq -r '(.routeMergeAi.enabled == true)' "$CONFIG")
USING_PROXY=$(jq -r '(.routeMergeAi.useSameOriginProxy == true)' "$CONFIG")
BASE_URL=$(jq -r '.routeMergeAi.baseUrl // ""' "$CONFIG")

if [ "$ENABLED" != "true" ] || [ "$USING_PROXY" != "true" ]; then
  write_disabled_snippet "routeMergeAi.enabled/useSameOriginProxy not both true (enabled=${ENABLED}, useSameOriginProxy=${USING_PROXY})"
  exit 0
fi

if [ -z "$BASE_URL" ]; then
  write_disabled_snippet "routeMergeAi.useSameOriginProxy is true but baseUrl is empty in ${CONFIG}"
  exit 0
fi

# Accept https://host or https://host/openai/... — proxy only needs scheme+host[:port]
UPSTREAM_ORIGIN="$(printf '%s' "$BASE_URL" | sed -E 's#^(https?://[^/]+).*$#\1#')"
UPSTREAM_HOST="$(printf '%s' "$UPSTREAM_ORIGIN" | sed -E 's#^https?://##; s#/.*##')"

if [ -z "${AZURE_API_KEY:-}" ] && [ -z "${AZURE_OPENAI_API_KEY:-}" ]; then
  write_disabled_snippet "neither AZURE_API_KEY nor AZURE_OPENAI_API_KEY is set (Secret/env missing?)"
  exit 0
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

echo "traffic-route-viz: /trv-azure-openai proxy ENABLED → upstream host ${UPSTREAM_HOST}" >&2

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
