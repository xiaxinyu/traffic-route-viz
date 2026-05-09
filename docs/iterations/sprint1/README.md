# Sprint 1 — 迭代索引

**迭代代号**: Sprint1  
**规划日期**: 2026-05-09  
**范围**: traffic-route-viz（YAML 导入拓扑可视化）

本目录存放 Sprint1 的规划产物，模板来源：`docs/templates/`。

| 文档 | 说明 |
|------|------|
| [01_GAP_ANALYSIS.md](./01_GAP_ANALYSIS.md) | 基线与差距分析 |
| [02_REQUIREMENTS.md](./02_REQUIREMENTS.md) | 需求规格（功能 / 非功能 / 验收） |
| [03_FIP.md](./03_FIP.md) | 功能实现计划（技术方案、风险、与现有架构衔接） |
| [04_TASK_LIST.md](./04_TASK_LIST.md) | 任务分解与依赖顺序 |

## 本迭代两大能力

1. **导入 YAML 行数统计**：单文件行数、当前合并视图行数、汇总指标。  
2. **路由合并推荐**：面向 Ingress / VirtualService 的合并建议，目标降行数、易维护；推荐结果可再导入并渲染画布（与现有解析链路一致）。

## GitHub

| 类型 | Issue |
|------|--------|
| Epic（Sprint1） | [#43](https://github.com/xiaxinyu/traffic-route-viz/issues/43) |
| FR-1 行数统计 | [#44](https://github.com/xiaxinyu/traffic-route-viz/issues/44) |
| FR-2 合并推荐 | [#45](https://github.com/xiaxinyu/traffic-route-viz/issues/45) |
