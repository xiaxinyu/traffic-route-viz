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
- **语义配色**：节点颜色映射维护在 `FlowNodes.tsx` 的 `NODE_COLOR_PALETTE`（与 `HARNESS_ENGINEERING.md` 保持一致）

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
pnpm install --ignore-scripts
pnpm run dev
pnpm run ci
pnpm run build
pnpm run preview
```

---

## Docker & K8s 发布（可选）

发布/部署的完整步骤统一放在：`DEPLOYMENT.md`（本文件只保留入口，避免信息漂移）。

---

## 已知限制与陷阱

- 仅 Ingress YAML：若缺少 Service/Endpoints，图只能画到 Service 名（不会凭空补资源）
- 跨 namespace 引用当前不建模（除非扩展并同步规格/验收）
- `pnpm install` 失败常见原因：网络超时或 `node_modules` 被占用/权限问题；可删除 `node_modules` 重装

## 近期交互优化（2026-05）

- 顶部状态条：节点/边/手写边统计 + 最近刷新时间 + 解析状态
- 节点搜索定位：支持关键字检索并“上一个/下一个”跳转到目标节点
- 类型筛选高亮：支持按节点类型聚焦，非命中节点自动降噪
- 详细设计与测试沉淀：`docs/UX_OPTIMIZATION_2026-05.md`

---

## 给 Agent 的短提示（复制用）

```
请先读 @AGENTS.md @HARNESS_ENGINEERING.md @PROJECT_GUIDE.md 。
目标是实现/修复 <你的目标>，并确保 web/ 下 pnpm run build 通过且不引入新 lints。
画布相关行为以 HARNESS_ENGINEERING.md 为准。
```
