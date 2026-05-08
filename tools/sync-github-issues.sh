#!/usr/bin/env bash
set -euo pipefail

# Sync issue seeds to GitHub issues via REST API.
# Requires:
#   - env GITHUB_TOKEN (repo scope)
#   - jq
#
# Usage:
#   REPO="owner/repo" SEED="docs/GITHUB_ISSUES_SEED_2026Q3.json" ./tools/sync-github-issues.sh

REPO="${REPO:-xiaxinyu/traffic-route-viz}"
SEED="${SEED:-docs/GITHUB_ISSUES_SEED_2026Q3.json}"
API="https://api.github.com/repos/${REPO}/issues"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found. Please install jq first." >&2
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required." >&2
  exit 1
fi

if [[ ! -f "${SEED}" ]]; then
  echo "Seed file not found: ${SEED}" >&2
  exit 1
fi

echo "Syncing issues from ${SEED} to ${REPO}..."

created=0
skipped=0

count=$(jq 'length' "${SEED}")
for ((i = 0; i < count; i++)); do
  title=$(jq -r ".[$i].title" "${SEED}")
  body=$(jq -r ".[$i].body" "${SEED}")
  labels=$(jq -c ".[$i].labels" "${SEED}")

  # Skip if same title already exists (open or closed)
  search_url="https://api.github.com/search/issues?q=$(python3 - <<PY
import urllib.parse
q='repo:${REPO} in:title "${title}"'
print(urllib.parse.quote(q))
PY
)"
  existing=$(curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" "${search_url}" | jq '.total_count')
  if [[ "${existing}" != "0" ]]; then
    echo "SKIP: ${title}"
    skipped=$((skipped + 1))
    continue
  fi

  payload=$(jq -n --arg title "${title}" --arg body "${body}" --argjson labels "${labels}" '{title:$title, body:$body, labels:$labels}')
  curl -sS -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "${API}" \
    -d "${payload}" >/tmp/trv_issue_create_resp.json

  url=$(jq -r '.html_url // empty' /tmp/trv_issue_create_resp.json)
  if [[ -n "${url}" ]]; then
    echo "CREATED: ${title} -> ${url}"
    created=$((created + 1))
  else
    echo "FAILED: ${title}"
    cat /tmp/trv_issue_create_resp.json
    exit 1
  fi
done

echo "Done. created=${created}, skipped=${skipped}"
