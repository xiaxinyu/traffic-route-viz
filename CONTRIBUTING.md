# Contributing

## 开发环境

- Node.js（建议 18+）

```bash
cd web
npm install
npm run dev
```

## 需求与验收

- 所有可视化/布局/导入体验改动必须符合：`ENGINEERING_REQUIREMENTS.md`
- 改动前先读：`VIBE_CODING.md`（含目录、命令、已知陷阱）

## 提交前检查

在提交前确保：

```bash
cd web
npm run build
```

并且在 UI 上验证：

- 多文件拖拽/选择导入可用，导入后自动刷新图
- 多 ingress 分区清晰，初始布局不出现严重重叠

## 代码分层（不要混）

- 解析：`web/src/k8sParser.ts`
- 构图/布局：`web/src/buildGraph.ts`
- 节点渲染：`web/src/FlowNodes.tsx`
- 导入与页面：`web/src/App.tsx`

