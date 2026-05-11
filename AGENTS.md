# Agent Handoff / 标准工程入口（traffic-route-viz）

本文件用于让你在**不同 Agent / 工具**之间切换时，不需要重复解释项目背景与验收标准。

## 先读什么（顺序）

1. `HARNESS_ENGINEERING.md`：**验收标准与画布 Harness 规格（单一事实来源）**
2. `PROJECT_GUIDE.md`：项目速览、目录结构、常用命令、已知陷阱（偏“操作手册”）

> 任何实现与文档冲突：以 `HARNESS_ENGINEERING.md` 为准，并同步修订文档保持一致。

## 项目一句话

把 Kubernetes YAML（Ingress/Service/Endpoints）解析成可交互拓扑图（React Flow），用于快速理解流量入口与后端服务/实例关系；支持多文件导入、分区拖拽、手写连线、PNG 导出与会话文件保存/打开。

## 代码入口（最常改的）

目录分层见 `web/src/README.md`（`app/`、`features/`、`domain/`）。

- 解析：`web/src/domain/k8sParser.ts`
- 多文件合并：`web/src/domain/mergeYamlBundles.ts`
- 构图/布局：`web/src/domain/buildGraph.ts`
- Ingress ↔ Istio URI 相交判定：`web/src/domain/istioIngressPathMatch.ts`（由 `buildGraph` 调用）
- 节点 UI：`web/src/features/diagram/FlowNodes.tsx`
- 画布宿主：`web/src/app/AppInner.tsx`（根 `web/src/App.tsx` 仅 re-export）
- 手写边/会话文件：`web/src/domain/diagramPersist.ts`
- PNG：`web/src/domain/diagramExportPng.ts`
- 画布操作条：`web/src/features/diagram/DiagramActions.tsx`
- 路由合并 v1 规则引擎：`web/src/features/route-merge/routeMergeRecommend.ts`；展示由 `web/src/features/route-merge/RouteMergeHelpTrigger.tsx` + `useRouteMergeAnalysis.ts`（「?」浮层）。
- 路由合并 AI：`web/src/features/route-merge/`（`RouteMergeAiModal.tsx`、`useRouteMergeAi.ts`、`routeMergeAi.ts`、`routeMergeAiPrompt.ts` 等）

## 常用命令

```bash
cd web
pnpm install --ignore-scripts
pnpm run dev
pnpm run build
```

## Agent 切换建议（给下一位 Agent 的短提示）

复制这段给任何 Agent（不论是代码 Agent / Debug Agent / Review Agent）：

```
请先读 @AGENTS.md @HARNESS_ENGINEERING.md @PROJECT_GUIDE.md 。
目标是实现/修复 <你的目标>，并确保 web/ 下 pnpm run build 通过且不引入新 lints。
画布相关行为以 HARNESS_ENGINEERING.md 为准。
```

