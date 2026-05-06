#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
导出某个 namespace 下的 Ingress + 关联 Service（按 Ingress 分文件），并打包压缩。

用法：
  tools/export-ingress-services.sh <namespace> [--context <kubectl-context>] [--out <output-dir>]

输出：
  <output-dir>/<namespace>/manifests/<ingress-name>.yaml   （多文档 YAML：Ingress + 关联 Service）
  <output-dir>/<namespace>/<namespace>.tar.gz              （压缩包，包含 manifests/）

依赖：
  - kubectl（已配置集群访问权限）
  - jq
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: missing dependency: $1" >&2
    exit 1
  fi
}

sanitize_filename() {
  # 按需求：文件名用 ingress name 命名；K8s Ingress 名通常可直接作为文件名。
  # 这里仅做极端情况下的兜底，避免生成非法路径字符。
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
    *)
      echo "Error: unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

KUBECTL=(kubectl)
if [[ -n "${KCTX}" ]]; then
  KUBECTL+=(--context "${KCTX}")
fi

if ! "${KUBECTL[@]}" get ns "${NAMESPACE}" >/dev/null 2>&1; then
  echo "Error: namespace not found or no access: ${NAMESPACE}" >&2
  exit 1
fi

WORKROOT="${OUTDIR%/}/${NAMESPACE}"
MANIFEST_DIR="${WORKROOT}/manifests"
mkdir -p "${MANIFEST_DIR}"

echo "Listing ingresses in namespace: ${NAMESPACE}"

# 取 ingress 名列表（稳定排序）
mapfile -t INGS < <("${KUBECTL[@]}" get ingress -n "${NAMESPACE}" -o json \
  | jq -r '.items[].metadata.name' \
  | sort)

if [[ ${#INGS[@]} -eq 0 ]]; then
  echo "No ingress found in namespace: ${NAMESPACE}"
  exit 0
fi

for ing in "${INGS[@]}"; do
  file_ing="$(sanitize_filename "${ing}")"
  out_file="${MANIFEST_DIR}/${file_ing}.yaml"

  echo "Exporting: ingress/${ing} -> ${out_file}"

  # 关联 Service 名：spec.rules[].http.paths[].backend.service.name + spec.defaultBackend.service.name
  mapfile -t SVCS < <("${KUBECTL[@]}" get ingress "${ing}" -n "${NAMESPACE}" -o json \
    | jq -r '
        [
          (.spec.defaultBackend.service.name? // empty),
          (.spec.rules[]?.http.paths[]?.backend.service.name? // empty)
        ]
        | flatten
        | map(select(. != null and . != ""))
        | unique
        | .[]
      ')

  {
    "${KUBECTL[@]}" get ingress "${ing}" -n "${NAMESPACE}" -o yaml
    if [[ ${#SVCS[@]} -gt 0 ]]; then
      for svc in "${SVCS[@]}"; do
        echo "---"
        "${KUBECTL[@]}" get service "${svc}" -n "${NAMESPACE}" -o yaml \
          || echo "# WARN: service not found: ${NAMESPACE}/${svc}"
      done
    else
      echo "---"
      echo "# INFO: no Service referenced by ingress/${ing} (no backend.service fields found)"
    fi
  } > "${out_file}"
done

tarball="${WORKROOT}/${NAMESPACE}.tar.gz"
echo "Creating tarball: ${tarball}"
tar -C "${WORKROOT}" -czf "${tarball}" "manifests"

echo "Done."
echo "Manifests dir: ${MANIFEST_DIR}"
echo "Tarball: ${tarball}"

