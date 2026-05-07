# Contributing

## 开发环境

- Node.js（建议 18+）

```bash
cd web
pnpm install --ignore-scripts
pnpm run dev
```

## 需求与验收

- 所有可视化/布局/导入体验改动必须符合：`HARNESS_ENGINEERING.md`
- 改动前先读：`PROJECT_GUIDE.md`（含目录、命令、已知陷阱）

## 提交前检查

在提交前确保：

```bash
cd web
pnpm install --ignore-scripts
pnpm run ci
```

或单独执行（便于定位失败项）：

```bash
cd web
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

并且在 UI 上验证：

- 多文件拖拽/选择导入可用，导入后自动刷新图
- 多 ingress 分区清晰，初始布局不出现严重重叠
- 画布：手柄拖线手写边、导出 PNG、`*.traffic-viz.json` 保存后再打开还原（含 YAML / 视图）

## 代码分层（不要混）

- 解析：`web/src/k8sParser.ts`
- 构图/布局：`web/src/buildGraph.ts`
- 节点渲染：`web/src/FlowNodes.tsx`
- 导入与页面：`web/src/App.tsx`
- YAML 合并、多文件列表：`web/src/mergeYamlBundles.ts`
- 画布会话 / 手写边合并：`web/src/diagramPersist.ts`、`DiagramActions.tsx`、`diagramExportPng.ts`

