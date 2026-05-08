#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
导出某个 namespace 下的 Istio VirtualService + 其依赖的 DestinationRule（按 VS 分文件）。

用法：
  tools/export-istio-vs-destinationrules.sh <namespace> [--context <kubectl-context>] [--out <output-dir>] [--out-root <dir>] [--tier <01|02|03>] [--group <name>]

默认输出（与 tools/export-ingress-services.sh 保持一致，只生成一个 <namespace>/ 目录）：
  <output-dir>/<namespace>/istio/<virtualservice-name>.yaml
  <output-dir>/<namespace>/istio.tar.gz    （压缩包，包含 istio/）

同时也会导出“资源原始 YAML（按名称分文件）”，便于完整归档：
  <output-dir>/<namespace>/istio/vs-<vs>.yaml
  <output-dir>/<namespace>/istio/dr-<dr>.yaml

可选输出（适配 traffic/example 的 01/02/03 目录原则）：
  --out-root traffic/example --tier 02 --group <namespace>-istio
  输出：traffic/example/<tier>-<group>/<virtualservice-name>.yaml
  压缩：traffic/example/<tier>-<group>/istio.tar.gz        （压缩包，包含该目录下所有 YAML）

文件内容：
  多文档 YAML：VirtualService + 0..N 个 DestinationRule（用 `---` 分隔）

依赖：
  - kubectl（已配置集群访问权限）
  - jq

说明（匹配逻辑）：
  - 从 VS 中提取 destination.host（HTTP/TLS/TCP route）
  - DestinationRule 若其 spec.host 与 VS 的 host 集合存在交集（含常见 FQDN/短名变体）则归入该 VS 文件
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: missing dependency: $1" >&2
    exit 1
  fi
}

sanitize_filename() {
  echo "$1" | tr '/\0' '__'
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "" ]]; then
  usage
  exit 0
fi

need_cmd kubectl
need_cmd jq

NAMESPACE="$1"
shift

KCTX=""
OUTDIR="."
OUT_ROOT=""
TIER="02"
GROUP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)
      KCTX="${2:-}"
      shift 2
      ;;
    --out)
      OUTDIR="${2:-}"
      shift 2
      ;;
    --out-root)
      OUT_ROOT="${2:-}"
      shift 2
      ;;
    --tier)
      TIER="${2:-}"
      shift 2
      ;;
    --group)
      GROUP="${2:-}"
      shift 2
      ;;
    *)
      echo "Error: unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${TIER}" != "01" && "${TIER}" != "02" && "${TIER}" != "03" ]]; then
  echo "Error: --tier must be one of 01/02/03 (got: ${TIER})" >&2
  exit 1
fi

KUBECTL=(kubectl)
if [[ -n "${KCTX}" ]]; then
  KUBECTL+=(--context "${KCTX}")
fi

if ! "${KUBECTL[@]}" get ns "${NAMESPACE}" >/dev/null 2>&1; then
  echo "Error: namespace not found or no access: ${NAMESPACE}" >&2
  exit 1
fi

if [[ -n "${OUT_ROOT}" ]]; then
  # Example-tiered output mode (explicitly opted-in)
  if [[ -z "${GROUP}" ]]; then
    GROUP="${NAMESPACE}-istio"
  fi
  OUT_DIR="${OUT_ROOT%/}/${TIER}-${GROUP}"
else
  # Default: align with export-ingress-services.sh (single namespace folder)
  WORKROOT="${OUTDIR%/}/${NAMESPACE}"
  OUT_DIR="${WORKROOT}/istio"
fi
mkdir -p "${OUT_DIR}"

echo "Listing Istio VirtualService in namespace: ${NAMESPACE}"

VS_JSON="$("${KUBECTL[@]}" get virtualservice -n "${NAMESPACE}" -o json 2>/dev/null || true)"
DR_JSON="$("${KUBECTL[@]}" get destinationrule -n "${NAMESPACE}" -o json 2>/dev/null || true)"

# If CRDs are missing or access is denied, kubectl may return empty output; keep jq pipelines stable.
if [[ -z "${VS_JSON}" ]]; then
  VS_JSON='{"items":[]}'
fi
if [[ -z "${DR_JSON}" ]]; then
  DR_JSON='{"items":[]}'
fi

mapfile -t VS_NAMES < <(echo "${VS_JSON}" | jq -r '.items[]?.metadata.name' | sort)
mapfile -t DR_NAMES_ALL < <(echo "${DR_JSON}" | jq -r '.items[]?.metadata.name' | sort)

if [[ ${#VS_NAMES[@]} -eq 0 ]]; then
  echo "No VirtualService found in namespace: ${NAMESPACE}"
  # Still export DestinationRules if any.
  if [[ ${#DR_NAMES_ALL[@]} -eq 0 ]]; then
    exit 0
  fi
fi

# Export raw resources (one YAML per resource) for complete archiving.
missing_vs_raw=()
missing_dr_raw=()
missing_vs_bundle=()

if [[ ${#VS_NAMES[@]} -gt 0 ]]; then
  echo "[VS] Exporting raw VirtualService YAMLs -> ${OUT_DIR}"
  for vs in "${VS_NAMES[@]}"; do
    vs_file="${OUT_DIR}/vs-$(sanitize_filename "${vs}").yaml"
    "${KUBECTL[@]}" get virtualservice "${vs}" -n "${NAMESPACE}" -o yaml --ignore-not-found=true \
      > "${vs_file}" || true
    if [[ ! -s "${vs_file}" ]]; then
      rm -f "${vs_file}"
      missing_vs_raw+=("${vs}")
      echo "[VS][WARN] not found (skipped raw export): ${NAMESPACE}/${vs}" >&2
    fi
  done
fi

if [[ ${#DR_NAMES_ALL[@]} -gt 0 ]]; then
  echo "[DR] Exporting raw DestinationRule YAMLs -> ${OUT_DIR}"
  for dr in "${DR_NAMES_ALL[@]}"; do
    dr_file="${OUT_DIR}/dr-$(sanitize_filename "${dr}").yaml"
    "${KUBECTL[@]}" get destinationrule "${dr}" -n "${NAMESPACE}" -o yaml --ignore-not-found=true \
      > "${dr_file}" || true
    if [[ ! -s "${dr_file}" ]]; then
      rm -f "${dr_file}"
      missing_dr_raw+=("${dr}")
      echo "[DR][WARN] not found (skipped raw export): ${NAMESPACE}/${dr}" >&2
    fi
  done
fi

# jq helpers:
# - Extract VS destination hosts from http/tls/tcp routes
# - Expand host variants for loose matching (short name / ns / svc / cluster.local)
JQ_HOST_UTILS='
def vsHosts:
  [
    (.spec.http[]?.route[]?.destination.host? // empty),
    (.spec.tls[]?.route[]?.destination.host? // empty),
    (.spec.tcp[]?.route[]?.destination.host? // empty)
  ]
  | flatten
  | map(select(type=="string" and . != ""))
  | unique;

def expandHost($h; $ns):
  # Normalize both short name and common FQDN variants so VS/DR match even if
  # one side uses `svc`, the other uses `svc.ns` / `svc.ns.svc` / `...cluster.local`.
  ($h | split(".") | map(select(. != ""))) as $p
  | ($p[0] // "") as $name
  | (
      if ($p | length) >= 2 then ($p[1]) else $ns end
    ) as $ns2
  | [
      # original (may already be fqdn)
      $h,
      # short + partial fqdn
      $name,
      "\($name).\($ns2)",
      "\($name).\($ns2).svc",
      "\($name).\($ns2).svc.cluster.local"
    ]
  | map(select(type=="string" and . != ""))
  | unique;

def expandSet($hs; $ns):
  ($hs | map(expandHost(.;$ns)) | add | unique);

def hasIntersection($a; $b):
  any($a[]; $b | index(.));
'

for vs in "${VS_NAMES[@]}"; do
  file_vs="$(sanitize_filename "${vs}")"
  out_file="${OUT_DIR}/${file_vs}.yaml"

  echo "[VS] Exporting bundle: virtualservice/${vs} (+DRs) -> ${out_file}"

  # Use the list snapshot for dependency matching, but re-fetch YAML for export.
  # This avoids failing the entire script if a VS disappears between list and export (race), or RBAC differs.
  VS_OBJ="$(echo "${VS_JSON}" | jq --arg n "${vs}" '.items[] | select(.metadata.name == $n)')"
  VS_HOSTS="$(echo "${VS_OBJ}" | jq -c "${JQ_HOST_UTILS} vsHosts")"

  # Compute expanded host set for this VS, then pick matching DR names.
  DR_NAMES="$(
    echo "${DR_JSON}" | jq -r --arg ns "${NAMESPACE}" --argjson hs "${VS_HOSTS}" "
      ${JQ_HOST_UTILS}
      (\$hs | expandSet(.; \$ns)) as \$vsset
      | [.items[]? | select(
          (.spec.host? // \"\") as \$dh
          | (\$dh | expandHost(.; \$ns)) as \$drset
          | hasIntersection(\$drset; \$vsset)
        ) | .metadata.name]
      | unique
      | .[]
    " | sort
  )"

  VS_YAML="$("${KUBECTL[@]}" get virtualservice "${vs}" -n "${NAMESPACE}" -o yaml --ignore-not-found=true 2>/dev/null || true)"
  if [[ -z "${VS_YAML}" ]]; then
    missing_vs_bundle+=("${vs}")
    echo "[VS][WARN] not found (skipped bundle): ${NAMESPACE}/${vs}" >&2
    continue
  fi

  {
    printf '%s\n' "${VS_YAML}"
    if [[ -n "${DR_NAMES}" ]]; then
      while IFS= read -r dr; do
        [[ -z "${dr}" ]] && continue
        echo "---"
        "${KUBECTL[@]}" get destinationrule "${dr}" -n "${NAMESPACE}" -o yaml \
          || echo "# WARN: destinationrule not found: ${NAMESPACE}/${dr}"
      done <<< "${DR_NAMES}"
    else
      echo "---"
      echo "# INFO: no DestinationRule matched by destination.host of virtualservice/${vs}"
    fi
  } > "${out_file}"
done

echo "Done."
echo "Output dir: ${OUT_DIR}"

echo "Summary:"
echo "  VS listed: ${#VS_NAMES[@]}   DR listed: ${#DR_NAMES_ALL[@]}"
echo "  VS raw missing: ${#missing_vs_raw[@]}   DR raw missing: ${#missing_dr_raw[@]}   VS bundle missing: ${#missing_vs_bundle[@]}"
if [[ ${#missing_vs_raw[@]} -gt 0 ]]; then
  printf '  Missing VS raw: %s\n' "${missing_vs_raw[*]}"
fi
if [[ ${#missing_dr_raw[@]} -gt 0 ]]; then
  printf '  Missing DR raw: %s\n' "${missing_dr_raw[*]}"
fi
if [[ ${#missing_vs_bundle[@]} -gt 0 ]]; then
  printf '  Missing VS bundle: %s\n' "${missing_vs_bundle[*]}"
fi

# Create a tarball:
# - default mode: <namespace>/istio.tar.gz contains istio/
# - example mode: <tier>-<group>/istio.tar.gz contains that folder's YAMLs
if [[ -z "${OUT_ROOT}" ]]; then
  tarball="${WORKROOT}/istio.tar.gz"
  echo "Creating tarball: ${tarball}"
  tar -C "${WORKROOT}" -czf "${tarball}" "istio"
  echo "Tarball: ${tarball}"
else
  tarball="${OUT_DIR}/istio.tar.gz"
  echo "Creating tarball: ${tarball}"
  tar -C "${OUT_DIR}" -czf "${tarball}" .
  echo "Tarball: ${tarball}"
fi

