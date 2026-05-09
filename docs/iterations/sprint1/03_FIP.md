# Functional Implementation Plan (FIP) — traffic-route-viz Sprint1

**Document ID**: FIP_TRV_SPRINT1  
**Issue**: Epic [#43](https://github.com/xiaxinyu/traffic-route-viz/issues/43)；FR-1 [#44](https://github.com/xiaxinyu/traffic-route-viz/issues/44)；FR-2 [#45](https://github.com/xiaxinyu/traffic-route-viz/issues/45)  
**Created**: 2026-05-09  
**Status**: Design / Implementation Plan  

---

## Overview

本计划将 Sprint1 两大能力落到现有架构：**解析 `k8sParser`、合并 `mergeYamlBundles`、构图 `buildGraph`、宿主 `App.tsx`**。不引入服务端；合并推荐以 **导出 YAML → 用户再导入** 完成与画布的闭环。

---

## Feature 1: YAML 行数统计

### Technical Approach

- **输入**：`ImportedYamlFile[]`（`id`, `name`, `text`）与 `mergeYamlFiles(files)` 的字符串结果。  
- **算法**：`text.split(/\n/).length`；若最后一行无换行，与常见编辑器行为对齐（可选：与 `monaco` 或简单 `lines = text.split(/\n/)` 一致并在文档说明）。  
- **展示**：在导入文件列表区域或新增「统计」折叠面板：表格列 `文件名 | 行数`，底部 `合计（文件之和）`、`合并 YAML 行数`。  
- **状态**：纯派生值，可用 `useMemo` 避免重复计算。  

### Files / Modules（预期）

| 区域 | 路径（建议） |
|------|----------------|
| 纯函数 | `web/src/yamlLineStats.ts`（新建，易测） |
| UI | `App.tsx` 或拆小组件 `ImportLineStatsPanel.tsx` |

### Risks

| 风险 | 缓解 |
|------|------|
| 合并拼接引入/不引入末尾换行导致行差 1 | 固定 `mergeYamlFiles` 拼接规范并在 UI 脚注说明 |
| 超大文本卡顿 | 仅在导入变更时计算一次；必要时 `requestIdleCallback`（可选） |

---

## Feature 2: 路由合并推荐（Ingress / VirtualService）

### Technical Approach

1. **输入分层**：
   - `ParseResult`：用于候选发现、冲突判断、画布闭环验证。
   - 原始 YAML documents / AST：用于候选 YAML 生成，避免仅凭 `ParseResult` 重建时丢失 annotations、TLS、Istio 扩展字段或字段顺序。
2. **分析阶段**：
   - 从 `ParseResult.ingresses` / `ParseResult.routes` 发现 Ingress 与 VirtualService 候选组。
   - 从原始 YAML documents 建立 `resourceRef -> rawDoc` 索引，用于完整字段检查与候选生成。
3. **v1 规则（实现与 UI 都必须硬编码展示）**
   - **Ingress Safe**：同 namespace + 同 ingressClassName + 同 host；annotations/TLS/defaultBackend/pathType 可无损保留；相同 path 不指向不同 backend。
   - **VirtualService Safe**：同 namespace + hosts 集合一致 + gateways 集合一致；仅合并 `spec.http[]`，并完整保留 match/route；存在无法完整保留的复杂字段时降级为 Review。
   - **Blocked**：跨 namespace、Gateway API、路径冲突、同规则不同 backend/destination、缺少原始 YAML doc、无法解析原始 doc。
4. **输出**：
   - `Recommendation[]`：
     - `id`
     - `kind: "Ingress" | "VirtualService"`
     - `level: "safe" | "review" | "blocked"`
     - `resourceRefs`
     - `rationale`
     - `estimatedLineDelta`
     - `warnings`
     - `candidateYaml?: string`
   - Safe 才允许 `candidateYaml`；Review/Blocked 不生成 YAML。
5. **闭环**：用户复制/下载候选 YAML → 再导入 → `parseK8sYaml` → `buildFlowGraph`；自动化测试覆盖这条路径。

### FR-2 Pipeline

```
ImportedYamlFile[]
  ├─ mergeParseResults(parseK8sYaml(file.text, file.name)) ──► candidate discovery
  └─ parse raw YAML documents ───────────────────────────────► resource raw-doc index

candidate groups ──► rule evaluator ──► Recommendation[]
                                  └──► candidate YAML generator (Safe only)
                                                   └──► parse/buildGraph validation
```

### Files / Modules（预期）

| 区域 | 路径（建议） |
|------|----------------|
| 规则常量 + 类型 | `web/src/routeMergeTypes.ts`（新建，可选；小规模也可并入推荐模块） |
| 分析 | `web/src/routeMergeRecommend.ts`（新建；纯函数，单测优先） |
| YAML 生成 | `web/src/routeMergeCandidateYaml.ts`（新建；只接收 Safe candidate） |
| UI | `RouteMergeSuggestions.tsx`（建议新建，避免继续膨胀 `App.tsx`） |
| 入口集成 | `App.tsx`（只负责传入 `importedFiles` 与当前 `ParseResult`） |

### UI / Interaction Design

- 在左侧输入区增加「Route Merge」按钮或折叠面板入口。
- 面板顶部固定展示 v1 规则边界：同 namespace、dry-run、不处理 Gateway API、不静默合并。
- 建议列表按 `Safe → Review → Blocked` 分组；每条展示涉及资源、预计减少行数、原因、warnings。
- Safe 建议提供「复制候选 YAML」「下载 YAML」「预览」；Review/Blocked 仅展示检查点。
- 默认不修改编辑器内容；如后续加入「载入候选 YAML 到编辑器」，必须二次确认。

### Risks

| 风险 | 缓解 |
|------|------|
| 仅用 `ParseResult` 重建 YAML 会丢失原始字段 | 候选 YAML 生成必须使用原始 YAML documents / AST；缺少原文时降级为 Review |
| 合并后语义与集群实际行为不完全一致 | UI 强提示「建议」；必须人工确认；冲突不自动合并 |
| VirtualService 复杂字段难以完整保留 | v1 Safe 范围收窄；复杂字段进入 Review，不生成 YAML |
| YAML 序列化字段顺序/风格 | 使用稳定 dump 选项；单测用 parse/buildGraph 验证，不以格式完全一致为目标 |
| 入口 UI 增加复杂度 | 使用独立组件与折叠面板，保持主工作台默认简洁 |

---

## Testing Strategy

- **单元测试**：
  - `yamlLineStats` 边界（空串、仅 `\n`、多文件）。
  - `routeMergeRecommend`：Safe Ingress、Safe VS、Review 复杂字段、Blocked 冲突、Blocked 跨 namespace。
  - `routeMergeCandidateYaml`：候选 YAML 可被 `parseK8sYaml` 解析。
- **闭环测试**：
  - Safe candidate YAML → `parseK8sYaml` → `buildFlowGraph` 不崩溃且产生入口/路由节点。
  - 冲突 fixture 不生成 `candidateYaml`。
- **手测**：`traffic/` 或 `examples/` 下样例导入 → 统计数字合理 → 建议导出 → 再导入无报错。  
- **构建**：`cd web && pnpm run build`。  

---

## Documentation Updates

- `HARNESS_ENGINEERING.md`：新增「导入行数统计」与「路由合并建议（v1）」的 UX 与 DoD 条目。  
- `PROJECT_GUIDE.md`：可选增加 `docs/iterations/sprint1/` 链接。  

---

## Rollout

- Feature flag：可选 `localStorage` 或 URL 参数开启「合并建议」Beta（Sprint1 可默认全开，由团队定）。  

---

*模板依据：`docs/templates/03_FIP_Template.md`（已裁剪）*
