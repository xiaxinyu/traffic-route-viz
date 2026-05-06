# Project Guide — traffic-route-viz

本文件是项目的“运行/协作手册”，用于快速接上下文、跑起来、以及在不同 Agent 之间切换时保持一致的工作方式。

规格与验收以 `HARNESS_ENGINEERING.md` 为准。

---

## 项目速览

- **目标**：把 Kubernetes YAML 解析为可交互拓扑图（React Flow）
- **前端栈**：Vite + React + TypeScript + React Flow + yaml
- **应用目录**：`web/`
- **示例数据**：`traffic/rbac/*.yaml`
- **数据流**：YAML → `k8sParser.ts` → `buildGraph.ts` → React Flow → `FlowNodes.tsx`

---

## 目录与关键文件

```
traffic-route-viz/
├── HARNESS_ENGINEERING.md     ← 规格/验收（单一事实来源）
├── PROJECT_GUIDE.md           ← 本文件（运行/协作手册）
├── AGENTS.md                  ← Agent 交接入口
├── README.md
├── CONTRIBUTING.md
├── tools/
│   └── export-ingress-services.sh
└── web/
    └── src/
        ├── App.tsx
        ├── k8sParser.ts
        ├── mergeYamlBundles.ts
        ├── buildGraph.ts
        ├── FlowNodes.tsx
        ├── diagramPersist.ts
        ├── diagramExportPng.ts
        └── DiagramActions.tsx
```

---

## 常用命令

```bash
cd web
npm install
npm run dev
npm run build
npm run preview
```

---

## Docker & K8s 发布（可选）

### 构建镜像（示例）

```bash
cd web
docker build -t your-registry/traffic-route-viz:latest .
docker push your-registry/traffic-route-viz:latest
```

### 部署到 Kubernetes（示例）

1) 修改 `k8s/traffic-route-viz.yaml` 中的 `image:` 与 `Ingress host`

2) 应用资源：

```bash
kubectl apply -f k8s/traffic-route-viz.yaml
```

### 登录配置（运行时）

- 通过挂载到站点根目录的 `config.json` 控制（K8s 已用 ConfigMap 示例）
- 开关：`auth.enabled`
- 账号/密码：`auth.username` / `auth.password`

---

## 已知限制与陷阱

- 仅 Ingress YAML：若缺少 Service/Endpoints，图只能画到 Service 名（不会凭空补资源）
- 跨 namespace 引用当前不建模（除非扩展并同步规格/验收）
- `npm install` 失败常见原因：网络超时或 `node_modules` 被占用/权限问题；可删除 `node_modules` 重装

---

## 给 Agent 的短提示（复制用）

```
请先读 @AGENTS.md @HARNESS_ENGINEERING.md @PROJECT_GUIDE.md 。
目标是实现/修复 <你的目标>，并确保 web/ 下 npm run build 通过且不引入新 lints。
画布相关行为以 HARNESS_ENGINEERING.md 为准。
```

