# Deployment / 发布指南 — traffic-route-viz

本文件面向“把项目发布出去”的场景：本地验证 → 构建镜像 → 推送镜像 → 部署到 Kubernetes。

> 画布/交互验收标准以 `HARNESS_ENGINEERING.md` 为准。

---

## 0. 你需要准备什么

- Node.js（建议 18+）
- Docker（如需构建镜像）
- Kubernetes + Ingress Controller（如需发布到集群）

---

## 1. 本地验证（推荐先做）

```bash
cd web
pnpm install --ignore-scripts
pnpm run build
pnpm run preview
```

---

## 2. 开发环境登录配置（可选）

系统支持运行时通过 `GET /config.json` 控制是否需要登录。

在 `web/` 下创建本地配置（该文件已被 `web/.gitignore` 忽略，不要提交仓库）：

```bash
cd web
cp public/config.example.json public/config.json
```

然后启动开发服务器：

```bash
cd web
pnpm run dev
```

---

## 3. Docker 构建与本地运行

生产发布形态为：Vite build → Nginx 静态托管（`web/Dockerfile` 多阶段构建）。

### 3.1 macOS（尤其 Apple Silicon）注意事项

集群通常运行在 **Linux amd64**。在 macOS/arm64 上构建时，建议显式指定平台为 `linux/amd64`，避免架构不匹配。

### 3.2 构建并本地跑起来

在仓库根目录执行（使用 `web/Dockerfile`，构建上下文为 `web/`）：

```bash
docker buildx build --platform linux/amd64 -t traffic-route-viz:local -f web/Dockerfile web --load
docker run --rm -p 8080:80 traffic-route-viz:local
```

打开 `http://localhost:8080`。

---

## 4. 推送镜像到 Harbor（你的地址）

你最终要推送到：

- `harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:latest`

### 4.1 推荐做法：同时推“可追溯版本 tag”+ `latest`

理由：`latest` 方便部署与对接，但不利于回滚/审计；因此建议每次发布都带一个**可追溯 tag**，并额外更新 `latest` 指向同一份镜像。

在仓库根目录执行（使用 `web/Dockerfile`，构建上下文为 `web/`）：

```bash
docker login harbor.ms5-sit.aswatson.net:8080

# 例：用日期 + git 短 sha 作为版本 tag（你也可以改成 v1.2.3）
# 注意：TAG 不能为空；如果你没先设置 TAG，下面会给一个默认值。
TAG="${TAG:-"$(date +%Y.%m.%d)-$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"}"
echo "Using TAG=$TAG"

docker buildx build --platform linux/amd64 \
  -t harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:"$TAG" \
  -f web/Dockerfile web --push
```

### 4.2 只推 `latest`（不推荐，但可用）

```bash
docker login harbor.ms5-sit.aswatson.net:8080
docker buildx build --platform linux/amd64 \
  -t harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:latest \
  -f web/Dockerfile web --push
```

### 4.3 推送后获取 digest（推荐用于 K8s 锁定）

> 目的：在 Kubernetes 中用 `@sha256:<digest>` 固定镜像，避免 `latest` 被覆盖导致“同名不同物”。

```bash
docker buildx imagetools inspect harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:latest
```

输出里会有 `Digest: sha256:...`。部署时可写成：

```yaml
image: harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz@sha256:<digest>
```

---

## 5. 发布到 Kubernetes（示例清单）

> 注意：根目录 `.gitignore` 默认忽略 `k8s/`。建议你在自己的环境里维护部署清单（或复制到单独的私有仓库/基础设施仓库）。

`HARNESS_ENGINEERING.md` 中给出了推荐的清单结构；仓库内提供**可提交**的整合示例：`k8s/traffic-route-viz.yaml`（Deployment、Secret、ConfigMap、Service、Ingress）。

### 5.1 需要改哪些地方

- **镜像地址**：`Deployment.spec.template.spec.containers[].image`
- **Ingress host**：`Ingress.spec.rules[].host`
- **登录配置**（可选）：
  - 用 `ConfigMap` 挂载到站点根目录 `/config.json`
  - Nginx 已配置对 `/config.json` 禁用缓存（见 `web/nginx/default.conf`）

### 5.2 路由合并 AI（推荐：Kubernetes Secret + ConfigMap + 同源代理）

目标：**API Key 不进 `config.json`、不进前端构建**；**endpoint / deployment / model** 只在 **ConfigMap 的 `config.json`**；密钥仅通过 **Secret → 环境变量**（如 `AZURE_OPENAI_API_KEY`）交给容器内 nginx 注入请求头。

> **与本地 `web/.env` 的区别**：`AZURE_OPENAI_*` / `VITE_*` 等 **只用于 `pnpm run dev`（Vite）**；**生产 Pod 不读 `.env`**。线上浏览器里的 `api-version`、`/openai/deployments/...` 来自 **`/config.json`**（通常即 ConfigMap 挂载）；Pod 内 nginx 同源代理只读同一文件里的 **`routeMergeAi.baseUrl`**（解析出主机，**HTTPS 默认 443**）+ 环境变量里的 Key。改 ConfigMap 后请 **`kubectl rollout restart deployment/traffic-route-viz`**（或删 Pod），否则 **`docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh` 不会重跑**，nginx 片段仍可能是旧 upstream。

1. **ConfigMap `config.json`**：`routeMergeAi.enabled=true`、`useSameOriginProxy=true`、`baseUrl`（以及 `deployment` / `model` / `apiVersion` / `apiStyle` 等，与前端解析一致）。**不要**写 `apiKey` / `bearerToken`。
2. **Secret**：只存 **`AZURE_OPENAI_API_KEY`**（经典 Azure OpenAI `api-key` 头）。若使用 OpenAI v1 / Responses 的 Bearer，可改为注入 **`AZURE_API_KEY`**（与镜像内脚本约定一致）。
3. **容器启动脚本**：读取挂载的 **`/usr/share/nginx/html/config.json`**，当 `enabled` 且 `useSameOriginProxy` 时启用 `/trv-azure-openai` 反向代理，并从 **`baseUrl` 推导 upstream 主机**，无需 `TRV_*` 环境变量。脚本生成的 nginx 片段将 **`proxy_*_timeout` / `send_timeout` 设为 900s**（与示例 Ingress 注解一致），避免 Pod 内 nginx 先于 Ingress 返回 **504**（错误页常为 `nginx/1.27.x`）。
4. **挂载**：将 ConfigMap 的 `config.json` 挂到容器内 `/usr/share/nginx/html/config.json`（`subPath`）。

5. **容器内 nginx 日志**：镜像将 **`access_log` → stdout、`error_log` → stderr**（见 `web/nginx/nginx.conf`），与 **Kubernetes 日志驱动**一致；请用 **`kubectl logs <pod>`** 查看请求与 upstream 超时（**不要**再依赖 `/var/log/nginx/access.log`）。

完整示例见 **`k8s/traffic-route-viz.yaml`**。应用前请替换镜像、Ingress、`REPLACE_ME` 与 Azure 占位符。

<details>
<summary>仅 Deployment 片段（与仓库文件一致时可不单独复制）</summary>

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

本地验证镜像（在**仓库根目录**执行；endpoint 来自挂载的 `config.json`，仅需密钥环境变量）：

```bash
docker run --rm -p 8080:80 \
  -e AZURE_OPENAI_API_KEY="$AZURE_OPENAI_API_KEY" \
  -v "$PWD/web/k8s/config.route-merge-ai.example.json:/usr/share/nginx/html/config.json:ro" \
  traffic-route-viz:local
```

### 5.3 应用资源

```bash
kubectl apply -f k8s/traffic-route-viz.yaml
```

### 5.4 NodePort / 外网访问与 AI 代理排障

1. **NodePort 要打在「节点」上，不要打在 Pod IP 上**  
   `31290` 会出现在**某台工作节点的 IP** 上（`kubectl get nodes -o wide`），与 **Pod IP** 不是一回事。若误用 Pod IP 会连不上。本机可用：`kubectl port-forward -n hds-aswatson-prd svc/traffic-route-viz 8080:80`。

2. **`/trv-azure-openai` 返回 503 JSON**  
   表示同源 AI 代理未启用（配置或密钥不满足）。请看 Pod 日志中 **`traffic-route-viz: /trv-azure-openai proxy DISABLED — …`** 一行，按提示检查：`config.json` 里 `routeMergeAi.enabled`、`useSameOriginProxy`、`baseUrl`，以及环境变量 **`AZURE_OPENAI_API_KEY`**（或 `AZURE_API_KEY`）。镜像已改为：即使密钥缺失也会**启动 nginx**（主站可访问），仅 AI 路径 503。

3. **Nginx worker 数量**  
   镜像内已将 **`worker_processes` 固定为 5**（避免 `auto` 在大核节点上产生大量 worker 进程）。

4. **其它**  
   - `kubectl get endpoints -n hds-aswatson-prd traffic-route-viz`：无 Endpoints 说明 Pod 未就绪或 selector 不对。  
   - 云厂商安全组 / 防火墙是否放行 NodePort 段 **30000–32767**。

### 5.5 Ingress 报 `504 Gateway Time-out`（页面显示 nginx）

常见两类：

1. **路由合并 AI / 大请求**  
   Ingress Controller（nginx）默认 **`proxy-read-timeout` 约 60s**。浏览器经 Ingress → Pod → Azure 拉模型时，超过即 **504**。  
   **处理**：在 Ingress 上拉长读写超时（示例清单已加 `nginx.ingress.kubernetes.io/proxy-read-timeout` / `proxy-send-timeout` 为 **900s**，并放宽 `proxy-body-size`）。若你自建 Ingress YAML，请合并同等 `metadata.annotations`。Kong / Traefik 需在其各自配置里调 upstream timeout。

2. **连首页都 504**  
   多为 **Service 无 Endpoints**（Pod 未 Ready / CrashLoop）、**Ingress `backend` 指错 Service/端口**，或 **集群出口/防火墙** 拦了到 Pod 网段。依次检查：  
   `kubectl get pods,endpoints,svc -n hds-aswatson-prd`、Pod 事件与日志、`kubectl describe ingress -n hds-aswatson-prd`。

### 5.6 如何保证配置「没有问题」（503 / 504 对照）

1. **应用前**  
   `kubectl apply --dry-run=client -f k8s/traffic-route-viz.yaml`  
   并确认已替换：**Secret 真实 key**、**ConfigMap 内 baseUrl/deployment/model**、**Ingress host**、**镜像**。

2. **应用后**（需 `kubectl` 连上集群）  
   ```bash
   NS=hds-aswatson-prd bash k8s/check-traffic-route-viz.sh
   ```  
   - `/healthz` 在 Pod 内必须 **200**。  
   - Pod 日志中应有 **`proxy ENABLED`**（AI 可用）或 **`proxy DISABLED — …`**（按原因修 Secret/ConfigMap）。  
   - 对 `/trv-azure-openai/...`：返回 **503 JSON** = 代理未启用；返回 **401/405** 等 = 代理已转发到 Azure（key/路径再细调）。

3. **集群或企业网络限制 Pod 出站**（例如默认拒绝出站到公网 **443**、或必须走 HTTP 代理）时，AI 会长时间挂起 → Ingress **504**。需由集群/网络团队放行目标 endpoint 或配置代理；本仓库清单**不包含** NetworkPolicy / egress 样例。

4. **入口不是 ingress-nginx**（如 Kong）时，仓库里的 `nginx.ingress.kubernetes.io/*` **不会生效**，必须在对应网关上为上游设置 **≥900s** 超时，否则 AI 仍 504。

### 5.7 Pod 内能 curl Service，但浏览器里主文档一直「待处理」(Pending)

说明 **ClusterIP / Endpoints / 容器内 nginx 正常**；问题在 **DNS → 负载均衡 → Ingress（或更外层网关）**，不是 `traffic-route-viz` Service 本身。

按顺序核对：

1. **Ingress 的 `host` 与浏览器是否一致**  
   `kubectl get ingress -n hds-aswatson-prd traffic-route-viz -o jsonpath='{.spec.rules[*].host}{"\n"}'`  
   必须与地址栏里的主机名**逐字相同**（例如 `traffic-route-viz.ms5-a1.aswatson.net`）。若仍是 `example.com` 等占位符，请改 YAML 后 `kubectl apply`，否则规则不匹配，行为依赖 Ingress 默认配置（常见为异常或长时间无响应）。

2. **`ingressClassName` 是否与集群一致**  
   `kubectl get ingressclass`  
   若集群没有 `nginx` 这一类，Ingress 可能**长期无 ADDRESS**，外网会一直 Pending。需改成集群实际类名（如 `nginx-internal`），或在 Kong/其它入口上单独建路由。

3. **Ingress 是否已绑定后端**  
   `kubectl describe ingress -n hds-aswatson-prd traffic-route-viz`  
   看 **Address**、**Backends** 是否为 `HEALTHY`（ingress-nginx 会显示）。若 `default backend` 或 backend 不健康，先修 Endpoints。

4. **从集群内带 Host 头模拟浏览器**（替换为你的域名与 Ingress Controller Service）  
   ```bash
   kubectl -n ingress-nginx get svc
   # 假设为 ingress-nginx-controller
   kubectl run curlj --rm -it --restart=Never --image=curlimages/curl -- \
     curl -sv --max-time 10 http://<INGRESS_CONTROLLER_CLUSTERIP> -H 'Host: traffic-route-viz.ms5-a1.aswatson.net' /
   ```  
   若此处很快返回 HTML，而外网 Pending，多半是 **公网 DNS / 负载均衡 / 防火墙** 未指到该 Ingress 或 443/80 被拦。

5. **HTTPS**  
   若浏览器用 **https://**，需在 Ingress 上配置 **tls**（证书）或由前置 LB 终止 TLS 再回源 HTTP；证书链错误时也可能长时间 Pending。可先用 **http://** 同一 host 对比排除 TLS。

6. **仓库清单**  
   `k8s/traffic-route-viz.yaml` 中 Ingress 的 `host` 已示例为 **`traffic-route-viz.ms5-a1.aswatson.net`**；若你使用其它域名，请改成与线上一致后再 apply。

### 5.8 浏览器约 **3 分钟** 后 **504**，但 Pod 内 `curl localhost:80` 正常

现象说明：**应用 Pod 与 ClusterIP Service 正常**；超时发生在 **Ingress Controller → Pod** 或 **公网负载均衡 → Ingress**。

**先跑集群内脚本**（不依赖本机网络；**不再使用 `kubectl run` 拉 curl 镜像**，避免 Cloud Shell / 受限集群镜像拉取超时）。脚本顺序：**0 部署/Pod** → **1 Endpoints** → **2 Service DNS /healthz**（`kubectl exec` 进业务 Pod，用 `wget`）→ **2b Ingress 摘要** → **3 Ingress ClusterIP + Host** → **4 IngressClass** → **结论汇总**。（若集群内另有 NetworkPolicy，由平台侧维护，不在本仓库示例中。）

```bash
NS=hds-aswatson-prd bash k8s/diagnose-504.sh
```

若脚本提示找不到 Ingress ClusterIP，先查：`kubectl get svc -A | grep -iE 'ingress|traefik'`，再设 `INGRESS_CLUSTERIP` 或 `INGRESS_NS`+`INGRESS_SVC` 重跑（见脚本头部注释）。

- 若 **步骤 2（Service DNS）失败**：若 `localhost /healthz` 正常但 `Service DNS :80` 超时，优先查 **CoreDNS**、经 Service 的 **hairpin** 行为、以及**命名空间内其它 NetworkPolicy**（本仓库不再提供样例策略）。  
- 若 **步骤 2 成功、步骤 3（经 Ingress VIP + Host）失败**：Ingress 规则、`ingressClassName`、或 **ingress-nginx 全局 ConfigMap**（如 `proxy-read-timeout`）与注解冲突；查 `kubectl describe ingress`、`kubectl logs -n ingress-nginx deploy/<controller>`。  
- 若 **步骤 2、3 均成功，仅外网 504**：问题在 **Ingress 之前的 DNS/LB/WAF**（**约 180s** 常为外层网关默认超时，与 Pod 内 nginx 无关）。

**清单已增加** `nginx.ingress.kubernetes.io/backend-protocol: "HTTP"`，避免部分环境误用 **HTTPS 回源** 导致长时间无响应。请 **`kubectl apply -f k8s/traffic-route-viz.yaml`** 后重试。

针对你看到的典型输出：

```text
Pod 1/1 Running，Endpoints 有 10.x.x.x:80
Pod 内 wget http://traffic-route-viz.<ns>.svc.cluster.local/healthz timed out
Pod 内 wget http://<Ingress ClusterIP>/ -H Host:... timed out
```

若同时 `kubectl exec ... wget http://127.0.0.1/healthz` 是 `ok`，应用本身和容器端口正常，再查 **集群 DNS、CNI/Service 路径、Ingress 规则**（若平台对命名空间挂了 NetworkPolicy，由平台文档处理）：

```bash
kubectl apply -f k8s/traffic-route-viz.yaml
NS=hds-aswatson-prd bash k8s/diagnose-504.sh
```

**说明**：Network 里 `content_main.js` / `style.css` 等 **200** 多为**浏览器扩展**请求，不代表你的站点资源已加载成功；以 **`document` / `favicon`** 为准。
