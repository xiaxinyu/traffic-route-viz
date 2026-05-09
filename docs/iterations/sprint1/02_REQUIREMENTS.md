# Requirements Specification — traffic-route-viz Sprint1

**Document ID**: REQ_TRV_SPRINT1  
**Issue**: Epic [#43](https://github.com/xiaxinyu/traffic-route-viz/issues/43)；FR-1 [#44](https://github.com/xiaxinyu/traffic-route-viz/issues/44)；FR-2 [#45](https://github.com/xiaxinyu/traffic-route-viz/issues/45)  
**Created**: 2026-05-09  
**Status**: Requirements Definition  
**Dependencies**: 以 `HARNESS_ENGINEERING.md` 为验收单一事实来源；本迭代新增能力须同步更新该文档相关小节。  

---

## Executive Summary

### Problem Statement

**Current State**

- 导入多份 Ingress / VirtualService 时，无法快速回答「总共多少行、每个文件多少行」。  
- 重复或可分片合并的路由配置只能靠人肉阅读，无法在工作台内获得 **可解释的合并建议**，也难以验证合并后拓扑是否仍正确。  

**Target State**

- 用户可在 UI 中查看 **逐文件行数** 与 **当前导入上下文下的汇总行数**（口径见下文）。  
- 系统可对 **Ingress / VirtualService** 给出 **合并/收敛建议**（v1 规则边界内），支持导出建议 YAML，**重新导入后画布可渲染**，用于维护性优化与行数下降。  

### Solution Overview

1. **YAML 行数统计模块** — 展示与可选导出摘要。  
2. **路由合并推荐引擎（v1）** — 结构化分析 + 建议列表 + 合并预览 YAML。  
3. **文档与验收** — 更新 `HARNESS_ENGINEERING.md` DoD。  

### Architecture Decision ✅ SELECTED

- **统计**：基于 `ImportedYamlFile[].text` 与 `mergeYamlFiles()` 结果分别计数；换行统一按 `\n`（与编辑器一致）。  
- **推荐**：在 `ParseResult` 层做分析，**不**对原始 YAML 做不可控的模糊合并；输出生成的新 YAML 字符串由用户显式「应用/导出」。  

### Architecture Flow（逻辑）

```
导入文件 ──► 行数统计（按文件 + 合并）
                │
解析 ParseResult ──► 合并推荐分析 ──► 建议报告 + 候选 YAML
                │                           │
                └──────────────────────────► 用户导出/复制 ──► 再导入 ──► buildGraph ──► Canvas
```

---

## Functional Requirements

### FR-1 YAML 行数统计

| ID | 描述 | 优先级 |
|----|------|--------|
| FR-1.1 | 对每个已导入文件显示 **行数**（基于该文件 `text`） | 🔴 MUST |
| FR-1.2 | 显示 **当前合并 YAML** 的总行数（`mergeYamlFiles(importedFiles)`） | 🔴 MUST |
| FR-1.3 | 显示 **所有导入文件行数之和**（各文件行数相加，可能与合并后因 `---` 拼接不同，需同时展示并说明） | 🟡 SHOULD |
| FR-1.4 | 空行是否计入：默认 **计入**；可在 UI 小字说明口径 | 🟢 COULD |
| FR-1.5 | 无导入文件时，对当前编辑器文本统计行数（与现有编辑器统计并存且不矛盾） | 🟡 SHOULD |

**验收**

- [ ] 多文件导入后，列表或详情中能看到每文件行数。  
- [ ] 能看到「合并 YAML 行数」与「各文件行数之和」。  
- [ ] `pnpm run build` 通过，无新增 lint。  

### FR-2 路由合并推荐（Ingress / VirtualService）

| ID | 描述 | 优先级 |
|----|------|--------|
| FR-2.1 | 提供入口（如侧栏或模态）触发「分析」 | 🔴 MUST |
| FR-2.2 | 输出 **建议列表**：每条含类型（Ingress/VS）、涉及资源、理由、预估可减少行数（估算即可） | 🔴 MUST |
| FR-2.3 | v1 **规则范围**须写死并在 UI 展示（例如：仅同 namespace；仅非冲突 path；不含 Gateway API） | 🔴 MUST |
| FR-2.4 | 用户可生成 **候选合并 YAML**（一个或多个文件内容），可复制或下载 | 🔴 MUST |
| FR-2.5 | 候选 YAML **重新导入**后须能被现有解析器解析并 **渲染画布**（与 `HARNESS_ENGINEERING.md` 范围内 kind 一致） | 🔴 MUST |
| FR-2.6 | 存在冲突或不确定时 **禁止静默合并**，须标记为「需人工处理」 | 🔴 MUST |
| FR-2.7 | 不扩展 `HARNESS_ENGINEERING.md` 当前 Out-of-Scope 资源种类作为合并输入 | 🔴 MUST |

**验收**

- [ ] 对官方样例或仓库内 `traffic/` 示例能跑出至少一种建议或明确「无安全建议」。  
- [ ] 导出的建议 YAML 可导入且无解析崩溃。  
- [ ] 文档记录 v1 规则边界。  

---

## Non-Functional Requirements

| ID | 描述 |
|----|------|
| NFR-1 | 300+ 节点场景下，「仅统计分析」交互须保持可接受响应（参考 `docs/PERFORMANCE_BASELINE.md`） |
| NFR-2 | 推荐计算可在 Web Worker 或分步执行，避免长时间阻塞主线程（Sprint1 可先做同步 + 数据量警告） |
| NFR-3 | 不存储用户 YAML 到服务端（纯前端） |

---

## Out of Scope（Sprint1）

- Gateway API、`EndpointSlice` 作为合并对象。  
- 自动写回集群或 Git。  
- 100% 语义等价证明（仅提供规则化建议 + 人工确认）。  

---

*模板依据：`docs/templates/02_Requirements_Template.md`（已裁剪）*
