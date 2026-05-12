#!/usr/bin/env bash
# 部署后自检：Pod / Service / Endpoints / Ingress / 探针路径 / AI 代理是否启用
# 用法：NS=hds-aswatson-prd bash k8s/check-traffic-route-viz.sh
set -euo pipefail
NS="${NS:-hds-aswatson-prd}"

echo "== namespace: $NS =="
kubectl get ns "$NS" 2>/dev/null || { echo "命名空间不存在: $NS"; exit 1; }

echo ""
echo "== pods / endpoints / svc / ingress =="
kubectl get pods,endpoints,svc,ingress -n "$NS" -o wide

POD=$(kubectl get pods -n "$NS" -l app.kubernetes.io/name=traffic-route-viz -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -z "${POD:-}" ]]; then
  echo "未找到带 app.kubernetes.io/name=traffic-route-viz 的 Pod，请检查 label。"
  exit 1
fi

echo ""
echo "== Pod $POD: 启动日志（AI 代理 ENABLE/DISABLE）=="
kubectl logs -n "$NS" "$POD" --tail=30 2>/dev/null | grep -E 'traffic-route-viz:|proxy (ENABLED|DISABLED)' || echo "(无匹配行，可看完整日志: kubectl logs -n $NS $POD)"

echo ""
echo "== Pod 内 wget /healthz 与 / (截断) =="
kubectl exec -n "$NS" "$POD" -- wget -qO- -T 3 http://127.0.0.1/healthz && echo " <- /healthz"
kubectl exec -n "$NS" "$POD" -- wget -qO- -T 3 http://127.0.0.1/ 2>/dev/null | head -c 80 && echo "... <- / (截断)"

echo ""
echo "== Pod 内 GET /trv-azure-openai/...（503 正文=代理未启用；401/405=代理已连上 Azure）=="
kubectl exec -n "$NS" "$POD" -- sh -c 'wget -qO- -T 8 http://127.0.0.1/trv-azure-openai/openai/deployments/dummy/chat/completions 2>&1 | head -c 500' || true
echo ""
echo "== Ingress（host 必须与浏览器地址栏一致；ADDRESS 为空则类名/控制器有问题）=="
kubectl get ingress -n "$NS" -o wide 2>/dev/null || true
kubectl describe ingress -n "$NS" 2>/dev/null | sed -n '/^Name:/,/^Events:/p' | head -60 || true

echo ""
echo "完成。"
echo "- 浏览器主文档一直「待处理」：多为 Ingress host / ingressClass / DNS-LB，见 DEPLOYMENT.md §5.3。"
echo "- 若 /trv-azure-openai 503：看 Pod 日志 proxy DISABLED；若 504：Ingress 超时或出站被拦。"
