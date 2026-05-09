# Task List — traffic-route-viz Sprint1

**Document ID**: TASK_TRV_SPRINT1  
**Issue**: Epic [#43](https://github.com/xiaxinyu/traffic-route-viz/issues/43)  
**Created**: 2026-05-09  
**Sprint**: Sprint1  

---

## Task Breakdown

## Role Model（建议）

| 角色 | 职责 |
|------|------|
| Owner-FE | UI 集成、面板交互、复制/下载、用户提示 |
| Owner-Engine | 纯函数分析器、候选 YAML 生成、闭环验证 |
| Reviewer | 安全边界、HARNESS 一致性、不可静默合并原则 |
| QA | fixture、手测、`pnpm run build`、导出再导入闭环 |

### Phase A — 文档与口径（可与开发并行）

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-A1 | 在 `HARNESS_ENGINEERING.md` 起草「行数统计」口径与 DoD | Reviewer | ⬜ | — |
| T-A2 | 在 `HARNESS_ENGINEERING.md` 起草「合并建议 v1」范围、dry-run 原则、Safe/Review/Blocked 定义与 DoD | Reviewer | ⬜ | — |
| T-A3 | Epic / 子 issue 与本文档互链 | Owner-FE | ⬜ | GitHub 创建后 |

### Phase B — Feature 1：YAML 行数统计

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-B1 | 新增 `yamlLineStats.ts`：`countLines(text)`、`summarizeImportedFiles(files)`、`mergeYamlLineCount` | Owner-Engine | ⬜ | — |
| T-B2 | 单元测试 `yamlLineStats.test.ts` | Owner-Engine | ⬜ | T-B1 |
| T-B3 | UI：导入列表旁或统计面板展示每文件行数、文件行数之和、合并 YAML 行数 | Owner-FE | ⬜ | T-B1 |
| T-B4 | 手测 + `pnpm run build` | QA | ⬜ | T-B3 |

### Phase C — Feature 2：路由合并推荐 v1

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-C1 | 定义 `Recommendation` / `CandidateGroup` 类型、`level: safe/review/blocked`、v1 规则常量 | Owner-Engine | ⬜ | T-A2 |
| T-C2 | 建立原始 YAML resource index：`resourceRef -> rawDoc`，用于保留 annotations/TLS/VS 扩展字段 | Owner-Engine | ⬜ | T-C1 |
| T-C3 | 实现 `routeMergeRecommend.ts`：从 `ParseResult` + rawDoc index 扫描 Ingress/VS 候选并输出 Safe/Review/Blocked | Owner-Engine | ⬜ | T-C1, T-C2 |
| T-C4 | 实现 `routeMergeCandidateYaml.ts`：仅对 Safe candidate 生成候选 YAML；Review/Blocked 不生成 | Owner-Engine | ⬜ | T-C3 |
| T-C5 | 单测 fixture 前置：Safe Ingress、Safe VS、复杂字段 Review、路径冲突 Blocked、跨 namespace Blocked | QA | ⬜ | T-C1 |
| T-C6 | 闭环单测：candidate YAML → `parseK8sYaml` → `buildFlowGraph`，冲突样例无 `candidateYaml` | QA | ⬜ | T-C4, T-C5 |
| T-C7 | UI 组件 `RouteMergeSuggestions.tsx`：分析按钮、规则边界、建议列表、复制/下载 YAML、warnings | Owner-FE | ⬜ | T-C3 |
| T-C8 | `App.tsx` 集成：传入 `importedFiles` 与当前 parse result；默认 dry-run，不自动覆盖编辑器 | Owner-FE | ⬜ | T-C7 |
| T-C9 | 闭环手测：导出 → 再导入 → 画布渲染；检查 Safe/Review/Blocked 都有明确文案 | QA | ⬜ | T-C8 |
| T-C10 | `pnpm run build` + lint / CI | QA | ⬜ | T-C8 |

### Phase D — 收尾

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-D1 | 更新 `PROJECT_GUIDE.md` 迭代链接（可选） | Owner-FE | ⬜ | — |
| T-D2 | PR 描述关联 Epic + 本目录路径，列出 FR-2 安全边界与验证证据 | Owner-FE | ⬜ | 实现 PR |

---

## Dependency Graph（简图）

```
T-A1, T-A2 ──► T-A3
T-B1 ──► T-B2, T-B3 ──► T-B4
T-C1 ──► T-C2 ──► T-C3 ──► T-C4 ──► T-C6
  │                 │                 ▲
  └────────────────► T-C5 ────────────┘
                    └──► T-C7 ──► T-C8 ──► T-C9, T-C10
```

---

## GitHub Issue 映射（创建后填写）

| 文档任务 | GitHub Issue # |
|----------|----------------|
| Epic Sprint1 | [#43](https://github.com/xiaxinyu/traffic-route-viz/issues/43) |
| FR-1 行数统计 | [#44](https://github.com/xiaxinyu/traffic-route-viz/issues/44) |
| FR-2 合并推荐 | [#45](https://github.com/xiaxinyu/traffic-route-viz/issues/45) |

---

*模板依据：`docs/templates/04_Task_List_Template.md`（已裁剪）*
