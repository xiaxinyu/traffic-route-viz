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
TAG="2026.05.07-$(git rev-parse --short HEAD)"

docker buildx build --platform linux/amd64 \
  -t harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:"$TAG" \
  -t harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:latest \
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

`HARNESS_ENGINEERING.md` 中给出了推荐的清单结构；你也可以参考仓库内的示例 `k8s/traffic-route-viz.yaml`（若你本地有该文件）。

### 5.1 需要改哪些地方

- **镜像地址**：`Deployment.spec.template.spec.containers[].image`
- **Ingress host**：`Ingress.spec.rules[].host`
- **登录配置**（可选）：
  - 用 `ConfigMap` 挂载到站点根目录 `/config.json`
  - Nginx 已配置对 `/config.json` 禁用缓存（见 `web/nginx.conf`）

### 5.2 应用资源

```bash
kubectl apply -f k8s/traffic-route-viz.yaml
```

