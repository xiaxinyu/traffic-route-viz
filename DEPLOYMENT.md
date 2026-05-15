# Deployment — traffic-route-viz

把应用从本机验证到推镜像、再部署到 Kubernetes 的**操作顺序**说明。画布与交互验收以 **`HARNESS_ENGINEERING.md`** 为准。

---

## 0. 前置

- Node.js **20+**、`pnpm`（与 `web/package.json` `engines` 及 CI 一致）
- Docker（构建 / 本地跑镜像）
- 若上集群：`kubectl`、Ingress Controller

---

## 1. 本地构建

```bash
cd web
pnpm install --ignore-scripts
pnpm run build
pnpm run preview
```

---

## 2. 运行时 `/config.json`（可选：登录等）

应用通过 **`GET /config.json`** 读登录等配置。本地可复制示例后改（**勿提交**）：

```bash
cd web
cp public/config.example.json public/config.json
pnpm run dev
```

---

## 3. Docker 镜像

- **形态**：`pnpm run build` → 静态文件由容器内 **Nginx** 提供（`web/Dockerfile`）。
- **架构**：集群多为 **linux/amd64**；Apple Silicon 上构建请加 `--platform linux/amd64`。

仓库根目录：

```bash
docker buildx build --platform linux/amd64 -t traffic-route-viz:local -f web/Dockerfile web --load
docker run --rm -p 8080:80 traffic-route-viz:local
```

浏览器打开 `http://localhost:8080`。

---

## 4. 推 Harbor（示例 registry）

目标仓库示例：`harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz`。

**Tag 约定**：`YYYY.MM.DD-<git短sha>` 便于追溯；**同一 digest 上挂多个 tag**（例如同日多次构建）在 Harbor 里是正常现象，**不是** Kubernetes 报错的原因。

**推荐**：一次 `buildx` **同时 push 可追溯 tag + `latest`**，避免 UI 里出现「无 tag 的孤儿 digest」、也方便环境拉 `latest`。

```bash
docker login harbor.ms5-sit.aswatson.net:8080
TAG="${TAG:-"$(date +%Y.%m.%d)-$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"}"
REG="harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz"
echo "Using TAG=$TAG"

docker buildx build --platform linux/amd64 \
  -t "$REG:$TAG" -t "$REG:latest" \
  -f web/Dockerfile web --push
```

**锁定 digest**（避免 `latest` 被覆盖后“同名不同物”）：

```bash
docker buildx imagetools inspect harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:"$TAG"
# 部署：image: .../traffic-route-viz@sha256:<digest>
```

---

## 5. Kubernetes

> 根目录 **`.gitignore` 可能忽略 `k8s/`**；若你本地看不到清单，用仓库里的 **`k8s/traffic-route-viz.yaml`** 或复制到自己的 GitOps 仓库。

**示例清单**：`Namespace`、`Secret`、`ConfigMap`、`Deployment`、`Service`、`Ingress`（见 `HARNESS_ENGINEERING.md` 部署小节）。

### 5.1 上线前必改

| 项 | 位置 |
|----|------|
| 镜像 | `Deployment` → `containers[].image` |
| 域名 | `Ingress` → `spec.rules[].host`（须与浏览器地址栏**完全一致**） |
| Azure Key | `Secret` → `AZURE_OPENAI_API_KEY`（勿留占位符） |
| AI 与登录 | `ConfigMap` → `config.json`（`routeMergeAi`、`auth` 等） |

```bash
kubectl apply -f k8s/traffic-route-viz.yaml
```

---

### 5.2 路由合并 AI（生产推荐路径）

**一条链**：浏览器读 **`/config.json`**（通常来自 ConfigMap 挂载）拼请求路径；**密钥**只来自 **Secret → 环境变量**；Pod 内 **`docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh`** 在**容器启动时**读同一 `config.json` 里的 **`routeMergeAi.baseUrl`**，生成 Nginx 片段，把 **`/trv-azure-openai`** 反代到 Azure（**HTTPS 443**，无单独“开放端口”变量）。

| 来源 | 生产 Pod 是否使用 |
|------|-------------------|
| `web/.env`、`VITE_*`、`AZURE_OPENAI_*`（本地脚本除外） | **否**；仅 **`pnpm run dev`** 等开发场景 |
| `config.json`（ConfigMap） | **是**（`baseUrl`、`deployment`、`model`、`apiVersion`…） |
| `AZURE_OPENAI_API_KEY` / `AZURE_API_KEY`（Secret） | **是**（注入 `api-key` / `Authorization`） |

**必做**：改 ConfigMap 后 **`kubectl rollout restart deployment/traffic-route-viz -n <ns>`**（或删 Pod），否则启动脚本**不会重跑**，Nginx 反代片段可能仍是旧 `baseUrl`。

**日志**：`access_log` / `error_log` 指向 **stdout/stderr**（`web/nginx/nginx.conf`），排障用 **`kubectl logs <pod>`**，不要依赖 `/var/log/nginx/*.log`。

<details>
<summary>Deployment 片段：Secret + ConfigMap 挂载</summary>

```yaml
env:
  - name: AZURE_OPENAI_API_KEY
    valueFrom:
      secretKeyRef:
        name: traffic-route-viz-azure-openai
        key: AZURE_OPENAI_API_KEY
volumeMounts:
  - name: trv-config
    mountPath: /usr/share/nginx/html/config.json
    subPath: config.json
volumes:
  - name: trv-config
    configMap:
      name: traffic-route-viz-config
```

</details>

本地用镜像测 AI（仓库根目录；`config.json` 用示例挂载，密钥走环境变量）：

```bash
docker run --rm -p 8080:80 \
  -e AZURE_OPENAI_API_KEY="$AZURE_OPENAI_API_KEY" \
  -v "$PWD/web/k8s/config.route-merge-ai.example.json:/usr/share/nginx/html/config.json:ro" \
  traffic-route-viz:local
```

---

### 5.3 自检与排障（503 / 504 / Pending）

**应用前**：

```bash
kubectl apply --dry-run=client -f k8s/traffic-route-viz.yaml
```

**应用后**（`NS` 按实际命名空间）：

```bash
NS=hds-aswatson-prd bash k8s/check-traffic-route-viz.sh
```

- Pod 内 **`/healthz`** 须 **200**。
- 日志含 **`proxy ENABLED`** → AI 反代已启用；**`proxy DISABLED — …`** → 按该行修 `config.json` / Secret。
- 调 **`/trv-azure-openai/...`**：**503 JSON** → 代理未启用；**401/405** 等 → 已到 Azure，再查 key / 路径 / `api-version`。

| 现象 | 优先检查 |
|------|----------|
| **`/trv-azure-openai` 503 JSON** | `enabled` + `useSameOriginProxy` + `baseUrl`；环境变量是否有 Key；Pod 日志 `DISABLED` 原因 |
| **仅 AI 或大包 504** | Ingress / 网关 **read timeout**（示例 Ingress 已 **900s**）；Pod 内反代超时与 Ingress 对齐（脚本生成片段）；**非 ingress-nginx** 时注解无效，须在对应网关配 **≥900s** |
| **整站 504** | `Endpoints` 是否为空；Ingress `backend`；Pod 未 Ready |
| **浏览器主文档长期 Pending** | Ingress **`host`** 是否与地址栏一致；**`ingressClassName`** 是否存在；`describe ingress` 的 Address/Backend；公网 DNS/LB/WAF；可先 **http** 试同一 host 排除 TLS |
| **约 180s 才 504、Pod 内 localhost 正常** | 多发生在 **Ingress 前** LB/WAF；集群内分段验证：`NS=... bash k8s/diagnose-504.sh`（`kubectl exec` 业务 Pod + `wget`，无需 `kubectl run` curl 镜像） |
| **`serviceaccount "traffic-route-viz" not found`** | **与镜像 tag 无关**。当前仓库 `Deployment` **不**声明 `serviceAccountName`；集群里若仍引用旧 SA，先确认：`kubectl get deploy -n <ns> traffic-route-viz -o jsonpath='{.spec.template.spec.serviceAccountName}{"\n"}'`。非空则 **`kubectl apply -f k8s/traffic-route-viz.yaml`** 覆盖，或删掉该字段：`kubectl patch deploy -n <ns> traffic-route-viz --type=json -p='[{"op":"remove","path":"/spec/template/spec/serviceAccountName"}]'`（若提示 path 不存在说明已对齐） |

```bash
NS=hds-aswatson-prd bash k8s/diagnose-504.sh
```

脚本找不到 Ingress ClusterIP 时：`kubectl get svc -A | grep -iE 'ingress|traefik'`，再设环境变量 **`INGRESS_CLUSTERIP`** 或 **`INGRESS_NS` + `INGRESS_SVC`**（见脚本注释）。

**其它**：NodePort 打在**节点 IP**，不是 Pod IP；需要时用 `kubectl port-forward -n <ns> svc/traffic-route-viz 8080:80`。清单含 **`nginx.ingress.kubernetes.io/backend-protocol: "HTTP"`**，避免误 **HTTPS 回源** 导致长时间无响应。

**集群出站被拦**（Pod 不能直连公网 443 等）时 AI 会挂起直至超时 → 须网络侧放行或代理；本仓库示例**不含** NetworkPolicy。

**浏览器 Network 面板**：`content_main.js` 等 **200** 常为扩展请求；以 **`document` / `favicon`** 为准。

---

## 6. 清单文件

- **`k8s/traffic-route-viz.yaml`**：整合示例（替换镜像、host、密钥与 Azure 占位后再 apply）。
