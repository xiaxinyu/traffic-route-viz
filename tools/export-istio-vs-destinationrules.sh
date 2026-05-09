#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
导出某个 namespace 下的 Istio VirtualService + DestinationRule（按资源分文件夹，日志可审计）。

用法：
  tools/export-istio-vs-destinationrules.sh <namespace> [--context <kubectl-context>] [--out <output-dir>] [--out-root <dir>] [--tier <01|02|03>] [--group <name>]
    [--export-mode <raw|per-vs|all>] [--dr-all-namespaces]

默认输出（与 tools/export-ingress-services.sh 保持一致，只生成一个 <namespace>/ 目录）：
  # export-mode=raw（默认）：按 `kubectl get vs/dr` 的真实列表逐个导出，文件互不混合
  <output-dir>/<namespace>/istio/vs/vs-<vs>.yaml
  <output-dir>/<namespace>/istio/dr/dr-<dr>.yaml
  <output-dir>/<namespace>/istio/all/virtualservices.yaml   （所有 VS 聚合，多文档）
  <output-dir>/<namespace>/istio/all/destinationrules.yaml  （所有 DR 聚合，多文档）
  <output-dir>/<namespace>/istio/manifest.txt               （本次导出文件清单）
  <output-dir>/<namespace>/istio.tar.gz    （压缩包，包含 istio/）

说明：
  - 默认导出“按资源单文件 + 两份全量聚合文件（VS/DR 各一份）”，最易解析、也便于一次性导入
  - 如需额外输出（按 VS 关联 DR / 或全量聚合），使用 `--export-mode` 切换（见下）

可选输出（适配 traffic/example 的 01/02/03 目录原则）：
  --out-root traffic/example --tier 02 --group <namespace>-istio
  输出：
    traffic/example/<tier>-<group>/<virtualservice-name>.virtualservice.yaml
    traffic/example/<tier>-<group>/<virtualservice-name>.destinationrules.yaml
  压缩：traffic/example/<tier>-<group>/istio.tar.gz        （压缩包，包含该目录下所有 YAML）

文件内容（export-mode=all，可选）：
  - `virtualservices.yaml`：namespace 下全部 VirtualService（多文档 `---` 分隔）
  - `destinationrules.yaml`：namespace 下全部 DestinationRule（多文档 `---` 分隔）

可选（export-mode=per-vs，可选）：
  - `<vs>.virtualservice.yaml`：单文档 VirtualService
  - `<vs>.destinationrules.yaml`：按 destination.host 与 DR spec.host 交集做匹配（多文档 `---` 分隔；若为空会写入 INFO 注释）
  - `<vs>.report.txt`：每个 VS 的匹配报告（便于审计）

依赖：
  - kubectl（已配置集群访问权限）
  - jq

说明（匹配逻辑）：
  - 从 VS 中提取 destination.host（HTTP/TLS/TCP route）
  - DestinationRule 若其 spec.host 与 VS 的 host 集合存在交集（含常见 FQDN/短名变体）则归入该 VS 文件
  - 默认只在目标 namespace 内查找 DestinationRule；如需跨 namespace（少见），加 `--dr-all-namespaces`
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
DR_ALL_NAMESPACES=0
EXPORT_MODE="raw"

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
    --dr-all-namespaces)
      DR_ALL_NAMESPACES=1
      shift 1
      ;;
    --export-mode)
      EXPORT_MODE="${2:-}"
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
if [[ "${EXPORT_MODE}" != "raw" && "${EXPORT_MODE}" != "all" && "${EXPORT_MODE}" != "per-vs" ]]; then
  echo "Error: --export-mode must be one of raw|all|per-vs (got: ${EXPORT_MODE})" >&2
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
VS_DIR="${OUT_DIR}/vs"
DR_DIR="${OUT_DIR}/dr"
ALL_DIR="${OUT_DIR}/all"
mkdir -p "${VS_DIR}" "${DR_DIR}" "${ALL_DIR}"
MANIFEST="${OUT_DIR}/manifest.txt"
: > "${MANIFEST}"

echo "Listing Istio VirtualService in namespace: ${NAMESPACE}"

VS_JSON="$("${KUBECTL[@]}" get virtualservice -n "${NAMESPACE}" -o json 2>/dev/null || true)"
if [[ "${DR_ALL_NAMESPACES}" -eq 1 ]]; then
  echo "Listing Istio DestinationRule in ALL namespaces (for matching)"
  DR_JSON="$("${KUBECTL[@]}" get destinationrule -A -o json 2>/dev/null || true)"
else
  DR_JSON="$("${KUBECTL[@]}" get destinationrule -n "${NAMESPACE}" -o json 2>/dev/null || true)"
fi

# If CRDs are missing or access is denied, kubectl may return empty output; keep jq pipelines stable.
if [[ -z "${VS_JSON}" ]]; then
  VS_JSON='{"items":[]}'
fi
if [[ -z "${DR_JSON}" ]]; then
  DR_JSON='{"items":[]}'
fi

mapfile -t VS_NAMES < <(echo "${VS_JSON}" | jq -r '.items[]?.metadata.name' | sort)
if [[ "${DR_ALL_NAMESPACES}" -eq 1 ]]; then
  mapfile -t DR_NAMES_ALL < <(echo "${DR_JSON}" | jq -r '.items[]? | "\(.metadata.namespace)/\(.metadata.name)"' | sort)
else
  mapfile -t DR_NAMES_ALL < <(echo "${DR_JSON}" | jq -r '.items[]?.metadata.name' | sort)
fi

if [[ ${#VS_NAMES[@]} -eq 0 ]]; then
  echo "No VirtualService found in namespace: ${NAMESPACE}"
  # Still export DestinationRules if any.
  if [[ ${#DR_NAMES_ALL[@]} -eq 0 ]]; then
    exit 0
  fi
fi

# Export raw resources (one YAML per resource). This is the default mode.
missing_vs_raw=()
missing_dr_raw=()
missing_vs_bundle=()

if [[ ${#VS_NAMES[@]} -gt 0 ]]; then
  echo "[VS] Exporting VirtualService YAMLs -> ${VS_DIR}"
  for vs in "${VS_NAMES[@]}"; do
    vs_file="${VS_DIR}/vs-$(sanitize_filename "${vs}").yaml"
    "${KUBECTL[@]}" get virtualservice "${vs}" -n "${NAMESPACE}" -o yaml --ignore-not-found=true \
      > "${vs_file}" || true
    if [[ ! -s "${vs_file}" ]]; then
      rm -f "${vs_file}"
      missing_vs_raw+=("${vs}")
      echo "[VS][WARN] not found (skipped raw export): ${NAMESPACE}/${vs}" >&2
    else
      echo "[VS][OK] wrote: ${vs_file}"
      echo "${vs_file}" >> "${MANIFEST}"
    fi
  done
fi

if [[ ${#DR_NAMES_ALL[@]} -gt 0 ]]; then
  echo "[DR] Exporting DestinationRule YAMLs -> ${DR_DIR}"
  for dr in "${DR_NAMES_ALL[@]}"; do
    if [[ "${DR_ALL_NAMESPACES}" -eq 1 ]]; then
      dr_ns="${dr%%/*}"
      dr_name="${dr#*/}"
      dr_file="${DR_DIR}/dr-$(sanitize_filename "${dr_ns}")__$(sanitize_filename "${dr_name}").yaml"
      "${KUBECTL[@]}" get destinationrule "${dr_name}" -n "${dr_ns}" -o yaml --ignore-not-found=true \
        > "${dr_file}" || true
    else
      dr_file="${DR_DIR}/dr-$(sanitize_filename "${dr}").yaml"
      "${KUBECTL[@]}" get destinationrule "${dr}" -n "${NAMESPACE}" -o yaml --ignore-not-found=true \
        > "${dr_file}" || true
    fi
    if [[ ! -s "${dr_file}" ]]; then
      rm -f "${dr_file}"
      missing_dr_raw+=("${dr}")
      echo "[DR][WARN] not found (skipped raw export): ${NAMESPACE}/${dr}" >&2
    else
      echo "[DR][OK] wrote: ${dr_file}"
      echo "${dr_file}" >> "${MANIFEST}"
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

# Always export 2 aggregated files (all VS / all DR) into all/
out_vs_all="${ALL_DIR}/virtualservices.yaml"
out_dr_all="${ALL_DIR}/destinationrules.yaml"
echo "[VS] Exporting ALL VirtualService in namespace -> ${out_vs_all}"
"${KUBECTL[@]}" get virtualservice -n "${NAMESPACE}" -o yaml > "${out_vs_all}"
echo "[DR] Exporting ALL DestinationRule in namespace -> ${out_dr_all}"
"${KUBECTL[@]}" get destinationrule -n "${NAMESPACE}" -o yaml > "${out_dr_all}"
echo "${out_vs_all}" >> "${MANIFEST}"
echo "${out_dr_all}" >> "${MANIFEST}"

if [[ "${EXPORT_MODE}" == "all" ]]; then
  # all-mode: aggregated files only (raw files are still exported earlier for auditability)
  :
else
  if [[ "${EXPORT_MODE}" == "raw" ]]; then
    # raw mode already exported above; skip per-vs bundling
    :
  else
  for vs in "${VS_NAMES[@]}"; do
  file_vs="$(sanitize_filename "${vs}")"
  out_vs="${OUT_DIR}/${file_vs}.virtualservice.yaml"
  out_dr="${OUT_DIR}/${file_vs}.destinationrules.yaml"
  out_report="${OUT_DIR}/${file_vs}.report.txt"

  echo "[VS] Exporting: virtualservice/${vs} -> ${out_vs}"
  echo "[VS] Exporting: destinationrules for ${vs} -> ${out_dr}"

  # Use the list snapshot for dependency matching, but re-fetch YAML for export.
  # This avoids failing the entire script if a VS disappears between list and export (race), or RBAC differs.
  VS_OBJ="$(echo "${VS_JSON}" | jq --arg n "${vs}" '.items[] | select(.metadata.name == $n)')"
  VS_HOSTS="$(echo "${VS_OBJ}" | jq -c "${JQ_HOST_UTILS} vsHosts")"
  VS_HOSTS_EXP="$(
    echo "${VS_OBJ}" | jq -r --arg ns "${NAMESPACE}" "
      ${JQ_HOST_UTILS}
      (vsHosts | expandSet(.; \$ns))[]
    " | sort -u
  )"

  # Compute expanded host set for this VS, then pick matching DR names.
  DR_NAMES="$(
    echo "${DR_JSON}" | jq -r --arg ns "${NAMESPACE}" --argjson hs "${VS_HOSTS}" --arg allns "${DR_ALL_NAMESPACES}" "
      ${JQ_HOST_UTILS}
      (\$hs | expandSet(.; \$ns)) as \$vsset
      | [.items[]? | select(
          (.spec.host? // \"\") as \$dh
          | (\$dh | expandHost(.; \$ns)) as \$drset
          | hasIntersection(\$drset; \$vsset)
        ) | (if \$allns == \"1\" then \"\(.metadata.namespace)/\(.metadata.name)\" else .metadata.name end)]
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

  printf '%s\n' "${VS_YAML}" > "${out_vs}"

  : > "${out_dr}"
  if [[ -n "${DR_NAMES}" ]]; then
    first=1
    while IFS= read -r dr; do
      [[ -z "${dr}" ]] && continue
      if [[ "${first}" -eq 0 ]]; then
        echo "---" >> "${out_dr}"
      fi
      first=0
      if [[ "${DR_ALL_NAMESPACES}" -eq 1 ]]; then
        dr_ns="${dr%%/*}"
        dr_name="${dr#*/}"
        "${KUBECTL[@]}" get destinationrule "${dr_name}" -n "${dr_ns}" -o yaml \
          >> "${out_dr}" || echo "# WARN: destinationrule not found: ${dr_ns}/${dr_name}" >> "${out_dr}"
      else
        "${KUBECTL[@]}" get destinationrule "${dr}" -n "${NAMESPACE}" -o yaml \
          >> "${out_dr}" || echo "# WARN: destinationrule not found: ${NAMESPACE}/${dr}" >> "${out_dr}"
      fi
    done <<< "${DR_NAMES}"
  else
    echo "# INFO: no DestinationRule matched by destination.host of virtualservice/${vs}" >> "${out_dr}"
  fi

  # Human-friendly report for debugging matching correctness.
  {
    echo "virtualservice: ${NAMESPACE}/${vs}"
    echo ""
    echo "destination.host expanded set (count=$(echo "${VS_HOSTS_EXP}" | wc -l | tr -d ' ')):"
    echo "${VS_HOSTS_EXP}" | sed 's/^/  - /'
    echo ""
    if [[ -n "${DR_NAMES}" ]]; then
      echo "matched destinationrule(s) (count=$(echo "${DR_NAMES}" | wc -l | tr -d ' ')):"
      echo "${DR_NAMES}" | sed 's/^/  - /'
    else
      echo "matched destinationrule(s): (none)"
    fi
  } > "${out_report}"
  done
  fi
fi

echo "Done."
echo "Output dir: ${OUT_DIR}"
echo "Manifest: ${MANIFEST}"

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

