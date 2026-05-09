# Task List — traffic-route-viz Sprint1

**Document ID**: TASK_TRV_SPRINT1  
**Issue**: Epic [#43](https://github.com/xiaxinyu/traffic-route-viz/issues/43)  
**Created**: 2026-05-09  
**Sprint**: Sprint1  

---

## Task Breakdown

### Phase A — 文档与口径（可与开发并行）

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-A1 | 在 `HARNESS_ENGINEERING.md` 起草「行数统计」口径与 DoD | — | ⬜ | — |
| T-A2 | 在 `HARNESS_ENGINEERING.md` 起草「合并建议 v1」范围与 DoD | — | ⬜ | — |
| T-A3 | Epic / 子 issue 与本文档互链 | — | ⬜ | GitHub 创建后 |

### Phase B — Feature 1：YAML 行数统计

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-B1 | 新增 `yamlLineStats.ts`：`countLines(text)`、`summarizeImportedFiles(files)`、`mergeYamlLineCount` | — | ⬜ | — |
| T-B2 | 单元测试 `yamlLineStats.test.ts` | — | ⬜ | T-B1 |
| T-B3 | UI：导入列表旁或统计面板展示每文件行数、文件行数之和、合并 YAML 行数 | — | ⬜ | T-B1 |
| T-B4 | 手测 + `pnpm run build` | — | ⬜ | T-B3 |

### Phase C — Feature 2：路由合并推荐 v1

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-C1 | 定义 `Recommendation` 类型与 v1 规则表（代码注释 + 文档） | — | ⬜ | T-A2 |
| T-C2 | 实现 `routeMergeRecommend.ts`：从 `ParseResult` 扫描 VS/Ingress 可合并候选 | — | ⬜ | T-C1 |
| T-C3 | 生成候选 YAML（冲突路径返回 warnings，不静默合并） | — | ⬜ | T-C2 |
| T-C4 | UI：分析按钮、建议列表、复制/下载 YAML | — | ⬜ | T-C3 |
| T-C5 | 样例 fixture + 单测（至少 1 正例 + 1 冲突负例） | — | ⬜ | T-C2 |
| T-C6 | 闭环手测：导出 → 再导入 → 画布渲染 | — | ⬜ | T-C4 |
| T-C7 | `pnpm run build` + lint | — | ⬜ | T-C4 |

### Phase D — 收尾

| ID | 任务 | 负责人 | 状态 | 依赖 |
|----|------|--------|------|------|
| T-D1 | 更新 `PROJECT_GUIDE.md` 迭代链接（可选） | — | ⬜ | — |
| T-D2 | PR 描述关联 Epic + 本目录路径 | — | ⬜ | 实现 PR |

---

## Dependency Graph（简图）

```
T-A1, T-A2 ──► T-A3
T-B1 ──► T-B2, T-B3 ──► T-B4
T-C1 ──► T-C2 ──► T-C3 ──► T-C4 ──► T-C6, T-C7
              └──► T-C5
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
