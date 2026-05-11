# `web/src` 目录说明

面向后续功能扩展，源码按 **`app` / `features` / `domain`** 分层：

| 目录 | 职责 |
|------|------|
| **`app/`** | 应用入口与页面组合：`App.tsx`（`ReactFlowProvider` + `AuthGate`）、`AppInner.tsx`（主界面逻辑）、`nodeTypes`、`sampleYaml`、`trvIcons`、UI 偏好常量等。 |
| **`features/`** | 按业务功能拆分，可继续新增子目录（如 `features/<feature>/`）。当前：`auth/`、`diagram/`（画布节点与工具条）、`route-merge/`（路由合并规则引擎 + AI）。 |
| **`domain/`** | 与 UI 解耦的领域逻辑：K8s 解析、构图、`diagramPersist`、导出、`graphViewState`、运行时配置等；**单元测试与实现同目录**（`*.test.ts`）。 |

根目录保留 **`App.tsx`**（`export { default } from "./app/App"`）与 **`main.tsx`**，便于 Vite/工具链入口不变。

## 依赖约定

- **`features/*` → `domain/*`**：功能层调用领域层。
- **`app/*` → `features/*` / `domain/*`**：页面装配层调用下层。
- **`domain/*`**：尽量不引用 `features` / `app`（保持核心逻辑可单测）。

## 新增功能建议

1. 在 `features/<name>/` 下增加组件、hooks、类型；必要时在 `domain/` 增加纯函数模块。
2. 在 `app/AppInner.tsx` 或新的 `app/components/*` 中挂载 UI；避免把大块逻辑长期堆在单文件里。
3. 同步更新根目录 `AGENTS.md` / `HARNESS_ENGINEERING.md` 中的路径说明（若验收与文件位置相关）。
