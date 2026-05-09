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

1. **分析阶段**：消费 `ParseResult` 中已解析的 `ingresses`、`istio.virtualServices`（及关联 `destinationRules` 若需展示）。  
2. **规则 v1（示例方向，实现前在代码与文档中写死）**  
   - **VS**：同一 `namespace` + 同一 `host` 下，多条 `http` 可在 **path 前缀不重叠且 method/headers 无冲突** 时合并为单条 VS 的多个 `match`/`route`（具体以 Istio API 合法结构为准）。  
   - **Ingress**：同一 `ingressClassName`（若有）+ 同一 `rules[].host`，多条 path 可合并到单 Ingress 的 `http.paths`（path 类型一致、无冲突）。  
3. **输出**：  
   - `Recommendation[]`：{ kind, names, rationale, estimatedLineDelta, risk }  
   - `suggestedYaml`: 由结构化对象 `yaml.dump` 或现有序列化逻辑生成（与项目依赖一致）。  
4. **闭环**：用户复制/下载 → 清空或追加导入 → `parseK8sYaml` → `buildFlowGraph` → 画布一致。  

### Files / Modules（预期）

| 区域 | 路径（建议） |
|------|----------------|
| 分析 + 生成 | `web/src/routeMergeRecommend.ts`（新建） |
| 类型 | 可与 `k8sParser.ts` 类型复用 / 局部类型 |
| UI | `App.tsx` 或 `RouteMergeSuggestions.tsx` |

### Risks

| 风险 | 缓解 |
|------|------|
| 合并后语义与集群实际行为不完全一致 | UI 强提示「建议」；必须人工确认；冲突不自动合并 |
| YAML 序列化字段顺序/风格 | 使用稳定 dump 选项；与现有导入测例对齐 |

---

## Testing Strategy

- **单元测试**：`yamlLineStats` 边界（空串、仅 `\n`、多文件）；`routeMergeRecommend` 对小型 fixture YAML。  
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
