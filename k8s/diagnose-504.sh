#!/bin/bash
#
# 504 / 外网异常排障：在集群内验证 Service → Ingress，不拉临时镜像（避免 Cloud Shell 超时）。
#
#   NS=hds-aswatson-prd bash k8s/diagnose-504.sh
#   INGRESS_CLUSTERIP=10.x.x.x NS=hds-aswatson-prd bash k8s/diagnose-504.sh
#   INGRESS_NS=kube-system INGRESS_SVC=rke2-ingress-nginx-controller NS=hds-aswatson-prd bash k8s/diagnose-504.sh
#
set -uo pipefail

NS="${NS:-hds-aswatson-prd}"
SVC="${SVC:-traffic-route-viz}"
INGRESS_NS="${INGRESS_NS:-ingress-nginx}"
INGRESS_SVC="${INGRESS_SVC:-ingress-nginx-controller}"

STEP2_OK=0
STEP3_OK=0
STEP3_SKIPPED=0

hr() { echo "================================================================================"; }

hr
echo "traffic-route-viz 排障 | NS=$NS SVC=$SVC | $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)"
KUBECTL_VERSION=$(kubectl version --client --short 2>/dev/null | head -1 || true)
if [[ -z "${KUBECTL_VERSION:-}" ]]; then
  KUBECTL_VERSION=$(kubectl version --client 2>/dev/null | head -1 || true)
fi
echo "kubectl: ${KUBECTL_VERSION:-unknown}"
hr

echo "== 0) Deployment / Pod 状态（须 Available、Running）=="
kubectl get deploy,pods -n "$NS" -l app.kubernetes.io/name=traffic-route-viz -o wide 2>/dev/null || kubectl get deploy,pods -n "$NS" -o wide | head -20
echo ""

echo "== 1) Endpoints（须出现 READY 地址:port=80）=="
kubectl get endpoints -n "$NS" "$SVC" -o wide 2>/dev/null || echo "(无 Endpoints 资源或命名空间不存在)"
READY_ADDRS=$(kubectl get endpoints -n "$NS" "$SVC" -o jsonpath='{range .subsets[*].addresses[*]}{.ip}{" "}{end}' 2>/dev/null || true)
if [[ -z "${READY_ADDRS// }" ]]; then
  echo "[WARN] 无就绪后端地址 → Ingress 易 502/504。请 kubectl describe pod / 检查 rollout。"
fi
echo ""

POD=$(kubectl get pods -n "$NS" -l app.kubernetes.io/name=traffic-route-viz -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -z "${POD:-}" ]]; then
  echo "== 2) 中止：未找到带 app.kubernetes.io/name=traffic-route-viz 的 Pod =="
  exit 1
fi

echo "== 2) Pod 内探测 Service DNS（不 kubectl run）=="
SVC_URL="http://${SVC}.${NS}.svc.cluster.local/healthz"
echo "  $ kubectl exec -n $NS $POD -- wget ... $SVC_URL"
if ! kubectl exec -n "$NS" "$POD" -- sh -c 'command -v wget >/dev/null 2>&1' 2>/dev/null; then
  echo "[FAIL] Pod 内无 wget，请换用含 wget 的镜像或在本机 kubectl port-forward 测 Service。"
else
  LOCAL_BODY=$(kubectl exec -n "$NS" "$POD" -- wget -qO- -T 5 http://127.0.0.1/healthz 2>/dev/null || true)
  if echo "$LOCAL_BODY" | grep -q 'ok'; then
    echo "[OK]   Pod localhost /healthz 正常"
  else
    echo "[FAIL] Pod localhost /healthz 失败，优先查容器 nginx / 探针 / 镜像。"
  fi
  BODY=$(kubectl exec -n "$NS" "$POD" -- wget -qO- -T 15 "$SVC_URL" 2>/dev/null || true)
  if echo "$BODY" | grep -q 'ok'; then
    echo "[OK]   Service DNS + /healthz 正常"
    STEP2_OK=1
  else
    echo "[FAIL] Service DNS 或集群内 DNS/CNI。wget 详情（末尾）："
    kubectl exec -n "$NS" "$POD" -- wget -S -O- -T 15 "$SVC_URL" 2>&1 | tail -25 || true
    if echo "$LOCAL_BODY" | grep -q 'ok'; then
      echo "[HINT] localhost 正常但 Service:80 超时：可查 CoreDNS、经 Service 的 hairpin、或命名空间内其它策略（由平台维护）。"
    fi
  fi
fi
echo ""

echo "== 2b) Ingress 快照（host / class / address）=="
kubectl get ingress -n "$NS" "$SVC" -o wide 2>/dev/null || echo "(无 Ingress $SVC)"
kubectl describe ingress -n "$NS" "$SVC" 2>/dev/null | sed -n '/^Rules:/,/Annotations:/p' | head -40 || true
echo ""

HOST=$(kubectl get ingress -n "$NS" "$SVC" -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || true)
if [[ -z "${HOST:-}" ]]; then
  HOST="traffic-route-viz.ms5-a1.aswatson.net"
  echo "[WARN] Ingress 未配置 host，探测使用占位: $HOST"
fi

ING_IP="${INGRESS_CLUSTERIP:-}"
if [[ -z "$ING_IP" ]]; then
  ING_IP=$(kubectl get svc -n "$INGRESS_NS" "$INGRESS_SVC" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || true)
fi
if [[ -z "$ING_IP" || "$ING_IP" == "None" ]]; then
  found=0
  for try_ns in ingress-nginx kube-system cattle-system; do
    [[ "$found" -eq 1 ]] && break
    for try_svc in ingress-nginx-controller rke2-ingress-nginx-controller nginx-ingress-controller traefik; do
      try_ip=$(kubectl get svc -n "$try_ns" "$try_svc" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || true)
      if [[ -n "${try_ip:-}" && "$try_ip" != "None" ]]; then
        ING_IP=$try_ip
        echo "[INFO] 自动发现 Ingress: $try_ns/$try_svc → $ING_IP"
        found=1
        break
      fi
    done
  done
fi
if [[ -z "$ING_IP" || "$ING_IP" == "None" ]]; then
  hit=$(kubectl get svc -A -l 'app.kubernetes.io/name=ingress-nginx' -o custom-columns=IP:.spec.clusterIP,NS:.metadata.namespace,NAME:.metadata.name --no-headers 2>/dev/null | awk '$1!="None" && $1!="" {print; exit}' || true)
  if [[ -n "${hit:-}" ]]; then
    ING_IP=$(echo "$hit" | awk '{print $1}')
    echo "[INFO] 自动发现 Ingress: $(echo "$hit" | awk '{print $2"/"$3}') → $ING_IP"
  fi
fi

echo "== 3) Pod 内探测 Ingress ClusterIP + Host（与浏览器一致）=="
if [[ -z "${ING_IP:-}" || "$ING_IP" == "None" ]]; then
  echo "[SKIP] 未得到 Ingress ClusterIP。"
  echo "       执行: kubectl get svc -A | grep -iE 'ingress|traefik'"
  echo "       然后: INGRESS_CLUSTERIP=<ClusterIP> NS=$NS bash k8s/diagnose-504.sh"
  STEP3_SKIPPED=1
else
  echo "  GET http://${ING_IP}/  Header Host: $HOST"
  HTML=$(kubectl exec -n "$NS" "$POD" -- wget -qO- -T 25 --header="Host: ${HOST}" "http://${ING_IP}/" 2>/dev/null || true)
  if echo "$HTML" | grep -q '<!DOCTYPE html'; then
    echo "[OK]   经 Ingress VIP 收到 HTML"
    STEP3_OK=1
  else
    echo "[FAIL] Ingress 路径或规则不匹配 / 超时。wget 详情（末尾）："
    kubectl exec -n "$NS" "$POD" -- wget -S -O- -T 25 --header="Host: ${HOST}" "http://${ING_IP}/" 2>&1 | tail -30 || true
  fi
fi
echo ""

echo "== 4) IngressClass（须与 Ingress.spec.ingressClassName 一致）=="
ING_CLASS=$(kubectl get ingress -n "$NS" "$SVC" -o jsonpath='{.spec.ingressClassName}' 2>/dev/null || true)
echo "  本 Ingress ingressClassName: ${ING_CLASS:-<空>}"
kubectl get ingressclass -o custom-columns=NAME:.metadata.name,DRIVER:.spec.controller --no-headers 2>/dev/null | head -15 || echo "(无 IngressClass 或无权限)"
echo ""

hr
echo "结论汇总"
echo "  Service DNS /healthz (步骤2):     $([[ "$STEP2_OK" -eq 1 ]] && echo OK || echo FAIL)"
if [[ "$STEP3_SKIPPED" -eq 1 ]]; then
  echo "  Ingress VIP + Host (步骤3):       SKIP（请设 INGRESS_CLUSTERIP）"
else
  echo "  Ingress VIP + Host (步骤3):       $([[ "$STEP3_OK" -eq 1 ]] && echo OK || echo FAIL)"
fi
hr
echo "若 (2) FAIL        → 查 Endpoints、DNS、Pod Ready。"
echo "若 (2) OK (3) FAIL → 查 Ingress host/class、Controller 日志、backend-protocol。"
echo "若 (2)(3) OK 外网 504 → Ingress 前公网 LB/WAF 超时（常 ~180s）。"
echo "详见 DEPLOYMENT.md §5.3"
