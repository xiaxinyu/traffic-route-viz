# Contributing

## 开发环境

- Node.js **20+**（与 CI `.github/workflows/ci.yml` 一致；建议使用 `corepack enable` 与 lockfile 中的 pnpm 版本）

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

## 合并前：分支保护（仓库设置）

在 GitHub **Settings → Branches → Branch protection rules** 中为默认分支（如 `main`）启用：

- **Require a pull request before merging**（按团队习惯）
- **Require status checks to pass before merging**，并勾选 workflow **`ci`** 中的 job **`web`**（即 PR 上显示的必需检查）

此项仅在网页配置，无法通过 git 提交；合并前确保 CI 通过可减少「本地能跑、主线已红」的回滚成本。

---

并且在 UI 上验证：

- 多文件拖拽/选择导入可用，导入后自动刷新图
- 多 ingress 分区清晰，初始布局不出现严重重叠
- 画布：手柄拖线手写边、导出 PNG、`*.traffic-viz.json` 保存后再打开还原（含 YAML / 视图）

## 代码分层（不要混）

说明：`web/src/README.md`。

- 解析：`web/src/domain/k8sParser.ts`
- 构图/布局：`web/src/domain/buildGraph.ts`
- 节点渲染：`web/src/features/diagram/FlowNodes.tsx`
- 导入与页面：`web/src/app/AppInner.tsx`（入口 `web/src/App.tsx`）
- YAML 合并、多文件列表：`web/src/domain/mergeYamlBundles.ts`
- 画布会话 / 手写边合并：`web/src/domain/diagramPersist.ts`、`web/src/features/diagram/DiagramActions.tsx`、`web/src/domain/diagramExportPng.ts`

