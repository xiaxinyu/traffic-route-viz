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
| FR-2.3 | v1 **规则范围**须写死并在 UI 展示；不满足边界的对象只能输出「需人工处理」或「不可安全合并」 | 🔴 MUST |
| FR-2.4 | 用户可生成 **候选合并 YAML**（一个或多个文件内容），可复制或下载 | 🔴 MUST |
| FR-2.5 | 候选 YAML **重新导入**后须能被现有解析器解析并 **渲染画布**（与 `HARNESS_ENGINEERING.md` 范围内 kind 一致） | 🔴 MUST |
| FR-2.6 | 存在冲突或不确定时 **禁止静默合并**，须标记为「需人工处理」 | 🔴 MUST |
| FR-2.7 | 不扩展 `HARNESS_ENGINEERING.md` 当前 Out-of-Scope 资源种类作为合并输入 | 🔴 MUST |
| FR-2.8 | 推荐功能默认是 **dry-run**：不修改编辑器内容、不覆盖导入文件、不自动写回文件系统或集群 | 🔴 MUST |
| FR-2.9 | 候选 YAML 生成前须展示影响摘要：来源资源、保留资源、合并后资源名、风险等级、warnings、预计行数变化 | 🔴 MUST |
| FR-2.10 | 若缺少生成安全 YAML 所需的原始字段（例如注解、TLS、headers、match 扩展字段），必须降级为「只建议，不生成候选 YAML」 | 🔴 MUST |

#### FR-2 v1 安全边界（必须）

**共同边界**

- 仅处理 `HARNESS_ENGINEERING.md` In Scope 中的 `Ingress` 与 Istio `VirtualService`；不处理 Gateway API / EndpointSlice / 任意 CRD 扩展。
- 仅同 `namespace` 内合并；跨 namespace 一律标记为「需人工处理」。
- 推荐结果仅生成新的候选 YAML，不删除原文件、不自动替换编辑器内容。
- 发现任意冲突、不完整字段或无法判断语义等价时，**不得生成自动合并 YAML**，只能输出解释性建议。

**Ingress v1 边界**

- 仅同 `namespace` + 同 `ingressClassName` + 同 `rules[].host` 的 Ingress 可进入候选。
- `metadata.annotations`、`spec.tls`、`defaultBackend`、`pathType` 需相同或可无损合并；否则降级为人工处理。
- 同一 `host + path + pathType` 不得指向不同 backend；冲突时只报告，不合并。
- 候选 YAML 以一个新的 Ingress 承载多条 `http.paths`；保留必要 metadata，并在名称上使用可追溯后缀（如 `*-merged-candidate`）。

**VirtualService v1 边界**

- 仅同 `namespace` + 同 `hosts` 集合 + 同 `gateways` 集合的 VirtualService 可进入候选。
- v1 仅合并 `spec.http[]` route 列表；`tcp`、`tls`、`exportTo`、`delegate`、`mirror`、`corsPolicy`、`retries`、`fault`、`timeout` 等复杂字段若存在且无法完整保留，降级为人工处理。
- `http.match` 中 URI 可比较；存在 headers / queryParams / method / withoutHeaders 等扩展条件时，必须完整保留到候选 YAML，否则不生成候选。
- 同一 URI 匹配规则不能指向不同 destination/weight/subset；冲突时只报告，不合并。

#### 推荐级别

| Level | 含义 | 行为 |
|-------|------|------|
| Safe | 满足 v1 全部边界，且能生成可解析候选 YAML | 可复制/下载候选 YAML |
| Review | 有潜在收益，但字段复杂或语义不完全确定 | 仅展示建议、原因、人工检查点 |
| Blocked | 存在明确冲突或超出范围 | 不生成 YAML，只展示冲突说明 |

**验收**

- [ ] 对官方样例或仓库内 `traffic/` 示例能跑出至少一种建议或明确「无安全建议」。  
- [ ] 导出的建议 YAML 可导入且无解析崩溃。  
- [ ] 文档记录 v1 规则边界。  
- [ ] 冲突样例不会生成候选 YAML，并能展示冲突原因。
- [ ] 候选 YAML 重新导入后，`parseK8sYaml` 与 `buildFlowGraph` 均能完成。

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
