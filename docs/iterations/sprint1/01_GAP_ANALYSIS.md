# Baseline & GAP Analysis — traffic-route-viz Sprint1

**Document ID**: GAP_TRV_SPRINT1  
**Issue**: [#43](https://github.com/xiaxinyu/traffic-route-viz/issues/43)（Epic）  
**Created**: 2026-05-09  
**Branch**: （实现阶段再填，如 `feature/sprint1-yaml-metrics`）  
**Status**: Baseline Assessment & Gap Analysis  

---

## Executive Summary

### Current Baseline Status: 🟡 **部分就绪**

| 能力域 | 评估 | 说明 |
|--------|------|------|
| YAML 导入与合并解析 | 🟢 80–100% | 多文件/文件夹、`mergeYamlBundles`、`k8sParser` 已具备 |
| 画布渲染与分区 | 🟢 80–100% | `buildGraph` + React Flow |
| **导入内容行数度量** | 🔴 0–19% | 仅有编辑器内粗略统计，无「按导入文件 / 全量汇总」的统一指标 |
| **路由配置合并推荐** | 🔴 0–19% | 无自动分析、无建议输出、无与画布闭环 |

### Key Findings

1. ✅ **现有解析与图构建**：可对 Ingress / VS / DR 等建模，推荐结果可通过「生成 YAML → 再导入」复用同一链路。  
2. ✅ **YAML 文本与多文件状态**：`ImportedYamlFile`、`mergeYamlFiles` 为按文件计数提供数据基础。  
3. ❌ **行数统计产品化**：缺少侧栏或独立面板展示「每文件行数、合计、合并后总行数」的一致口径。  
4. ❌ **合并推荐语义**：未定义可解释的合并规则（安全边界、冲突策略、人工确认）。  
5. ❌ **可逆与审计**：推荐若自动改写 YAML，需 diff / 导出 / 版本说明，当前无。  

### Critical Gap: **可观测的 YAML 规模 + 可维护的路由收敛**

**需求方向**：团队需要量化「导入了多少配置」，并在此基础上获得 **减少 Ingress/VS 冗余、降低行数** 的可执行建议，且建议结果必须能 **再次渲染画布** 以验证语义。

#### Option A: 仅文档化手工合并（未选）

- 不开发工具，依赖人工。  
- **不选原因**：与产品目标（工作台一体化）不符，不可规模化。

#### Option B: 工作台内统计 + 规则化合并建议 + 导出 YAML ✅ **SELECTED**

- **统计**：在导入上下文内计算行数（按文件 + 合并文本 + 可选按 kind 过滤）。  
- **推荐**：基于解析后的结构化模型（非纯文本 diff）生成候选合并方案；用户确认后导出 YAML，再走现有 `parseK8sYaml` / `buildFlowGraph`。  
- **益处**：与 `HARNESS_ENGINEERING.md` 单一事实来源对齐；风险可控（默认建议，不静默写生产）。  

---

## Detailed Gap Matrix（摘要）

| 项 | 现状 | 目标 | 严重度 |
|----|------|------|--------|
| 单文件行数 | 无统一展示 | 列表或详情可见 | 🟡 HIGH |
| 全导入合计行数 | 无 | 明确口径（合并前合计 / 合并后文档） | 🟡 HIGH |
| VS/Ingress 合并建议 | 无 | 规则集 v1 + 解释 + 导出 | 🔴 CRITICAL |
| 推荐结果 → 画布 | 无闭环 | 导入推荐 YAML 可渲染 | 🔴 CRITICAL |

---

## Recommendation & Migration Path

1. **Sprint1 先做统计**（低风险，立即可用），对齐口径写进 `HARNESS_ENGINEERING.md` 验收条。  
2. **合并推荐 v1**：限定范围（例如：同 host + path 前缀可合并的 VS http 规则；或同 ingressClass 下多 Ingress 的 host/path 去重），输出 **建议报告 + 可选合并 YAML**。  
3. **后续 Sprint**：扩展规则、与 GitOps / PR 集成、自动冲突检测加强。  

---

*模板依据：`docs/templates/01_GAP_Analysis_Template.md`（已按本项目裁剪）*
