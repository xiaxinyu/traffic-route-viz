# Coding Spec（逆向工程沉淀）— traffic-route-viz

本文件是基于当前代码实现（`web/src/*`）反向整理的**代码级规范**。  
功能验收仍以 `HARNESS_ENGINEERING.md` 为最高准则；本文件回答“代码现在是如何工作的”与“改动时必须遵守什么约束”。

---

## 1. 系统定位

- 产品目标：把 Kubernetes / Istio / Contour 的入口到后端链路解析并可视化成可编辑拓扑。
- 技术栈：Vite + React + TypeScript + React Flow + yaml。
- 运行方式：浏览器前端纯渲染；可选运行时登录配置（`/config.json`）。

---

## 2. 代码分层与职责

### 2.1 页面编排层

- `web/src/App.tsx`
  - 应用状态中心：YAML 文本、多文件导入、节点/边状态、搜索筛选、全局 UI 缩放、刷新解析。
  - React Flow 事件绑定：`onNodesChange/onEdgesChange/onConnect/onReconnect`。
  - 关键契约：
    - 手写边新增：`manualEdgeFromConnection`
    - 重连后手写化：`reconnectEdgeAsManual`
    - 解析刷新保留手写边：`mergeComputedEdgesKeepingManual`

### 2.2 解析与语义层

- `web/src/k8sParser.ts`
  - YAML 文档解析（Ingress/Service/Endpoints/VirtualService/DestinationRule/HTTPProxy/Istio Gateway）。
  - 输出统一 `ParseResult`：`ingresses/routes/services/endpoints/gateways/destinationRules/errors`。

- `web/src/mergeYamlBundles.ts`
  - 多文件读入、YAML 合并（`---`）、多次解析结果 merge。
  - 合并策略：同 key 去重并保留来源信息。

### 2.3 构图与布局层

- `web/src/buildGraph.ts`
  - 输入 `ParseResult`，输出 React Flow `nodes + edges`。
  - 职责：
    - 分区（Region）构建与三级层级（01/02/03）布局
    - Ingress / VS / HTTPProxy 主链路布局
    - Istio / Contour 跨区自动连线
    - Ingress→Ingress（Nginx 转发）相交判定与自动边
    - 边可编辑属性统一注入（`selectable/deletable/updatable/reconnectable/...`）

- `web/src/istioIngressPathMatch.ts`
  - 路径相交语义（Exact/Prefix/Regex + ImplementationSpecific 近似 Prefix）。

### 2.4 视图呈现层

- `web/src/FlowNodes.tsx`
  - 自定义节点组件：Region/Ingress/Host/Route/Service/Endpoints/IstioGateway/DR/HTTPProxy。
  - 语义色板单一事实来源：`NODE_COLOR_PALETTE`。
  - 连接手柄约定：
    - target：`t-left` / `t-right`
    - source：`s-left` / `s-right`
  - 任何边若指定了 handle id，节点必须存在对应 handle，否则边不会渲染。

- `web/src/graphViewState.ts`
  - 搜索/类型筛选高亮投影层。
  - 无搜索且 type=all 时必须原样透传 `nodes/edges`（避免干扰编辑态）。

### 2.5 持久化与导出层

- `web/src/diagramPersist.ts`
  - 画图文件 schema（`*.traffic-viz.json`）读写。
  - 手写边识别、合并、重连持久化。
  - `createEdgeNonce()` 提供跨运行环境 ID 兼容（`crypto.randomUUID` fallback）。

- `web/src/diagramExportPng.ts`
  - PNG 导出：按全图 bounds 计算导出帧（不是当前视口截图）。
- `web/src/diagramExportMermaid.ts` / `diagramExportDrawio.ts`
  - 第三方格式导出。

- `web/src/DiagramActions.tsx`
  - 导出、保存/打开会话、删除选中连线/元素工具栏。

### 2.6 运行时与鉴权

- `web/src/runtimeConfig.ts` + `web/src/AuthGate.tsx`
  - `GET /config.json` 读取运行时配置；
  - `auth.enabled` 为真时启用登录门禁。

---

## 3. 关键数据模型（代码约定）

- `ParseResult`：解析标准中间层
- `IngressRoute`：路由最小语义单位（Host + Path + Backend）
- `ServiceInfo / EndpointsInfo / IstioGatewayInfo / DestinationRuleInfo`
- `DiagramFileV1`：会话文件模型（含 `nodes/edges/viewport`）

---

## 4. 自动连线规则（代码行为）

### 4.1 基础链路

- `Ingress -> Host -> Route -> Service -> Endpoints`
- `Service -> DestinationRule`（虚线）
- `IstioGateway -> VirtualService`
- `Service(gateway) -> HTTPProxy/ContourGateway`

### 4.2 Istio Gateway 跨区连线

- 规则核心：Service backend 名称匹配 + URI 规则相交（见 `istioIngressPathMatch.ts`）
- 多 Ingress × 多 Gateway 采用 M×N 展开，但仅对通过相交判定者连线。

### 4.3 Ingress 分层转发（Nginx）

- 规则核心：Ingress 对 Ingress 的 Host+Path 相交。
- 分层样例下仅画相邻层前向边：`01->02`、`02->03`，防止视觉爆炸。
- 边标签：`Nginx 转发`。

---

## 5. 编辑能力契约

- 节点：可拖拽、可选择、可删除（含工具栏删除选中元素）。
- 边：可选择、可删除、可重连；默认 `interactionWidth` 需足够大。
- 手写边必须满足：
  - `edge.data.manual === true`
  - 样式与自动边区分（灰色虚线）
  - 刷新解析后，若端点仍存在则保留。

---

## 6. UI/视觉契约

- `01/02/03` 表示层级，不改变语义颜色。
- 语义色板固定，维护点：`FlowNodes.tsx::NODE_COLOR_PALETTE`。
- 全局缩放：
  - 顶部 `A- / 100% / A+`
  - 缩放范围 `[0.8, 1.4]`
  - 本地持久化 key：`trv.ui.scale`

---

## 7. 测试矩阵（当前）

- 单元测试：
  - `istioIngressPathMatch.test.ts`（路径相交语义）
  - `buildGraph.test.ts`（Ingress 转发边）
  - `diagramPersist.test.ts`（手写边持久化/重连）
  - `diagramExportPng.test.ts`（导出帧计算）
  - `graphViewState.test.ts`（筛选高亮逻辑）
  - `FlowNodes.test.ts`（语义配色映射）
- E2E：
  - `e2e/smoke.spec.cjs`
  - `e2e/export-png.spec.cjs`
  - `e2e/edge-editing.spec.cjs`

---

## 8. 改动红线（提交前必须自检）

1. 变更 `FlowNodes` 手柄 id 时，必须同步检查 `buildGraph` 所有 `sourceHandle/targetHandle`。
2. 变更节点卡片高度/布局时，必须同步 `buildGraph.ts` 的 `LAYOUT_EST_*` 常量。
3. 变更路径相交语义时，必须补 `istioIngressPathMatch.test.ts`。
4. 变更导出逻辑时，必须保证“导出整图而非视口”。
5. 变更可编辑能力时，必须验证：
   - 自动边可删可重连
   - 手写边可保留
   - 节点删除会联动清理关联边

---

## 9. 推荐开发流程（Spec Coding）

1. 先确认需求属于：解析语义 / 构图布局 / 交互编辑 / 导出持久化 / 视觉。
2. 定位到对应模块（见第 2 节）只改必要文件，避免横向扩散。
3. 先补或更新测试，再改实现。
4. 本地最小验证：
   - `corepack pnpm run test`
   - `corepack pnpm run build`
   - 必要时 `playwright` 冒烟。

---

## 10. 关联文档

- 规格与验收：`HARNESS_ENGINEERING.md`
- 项目运行手册：`PROJECT_GUIDE.md`
- 发布与部署：`DEPLOYMENT.md`
- 多 Agent 交接入口：`AGENTS.md`

---

## 11. 项目条件与约束清单（Constraint Register）

以下清单用于把“必须满足”的工程条件固化到代码规格，避免口头约定丢失。

| ID | 约束 | 强制级别 | 代码/文档落点 | 违反后果 |
| --- | --- | --- | --- | --- |
| C-01 | `HARNESS_ENGINEERING.md` 是画布行为与验收的单一事实来源 | MUST | `HARNESS_ENGINEERING.md` + 本文 | 实现与验收口径漂移 |
| C-02 | 入口分层目录 `01/02/03` 仅用于布局，不改变语义颜色 | MUST | `buildGraph.ts`, `FlowNodes.tsx` | 同类对象跨层识别困难 |
| C-03 | 所有业务节点必须有左右可见连接手柄（至少各一） | MUST | `FlowNodes.tsx` | 手写边无法建立 |
| C-04 | 若边设置 `sourceHandle/targetHandle`，对应节点必须存在该 id 手柄 | MUST | `buildGraph.ts` + `FlowNodes.tsx` | 边直接不渲染 |
| C-05 | 手写边必须 `edge.data.manual===true` 且刷新后保留有效边 | MUST | `diagramPersist.ts` | 用户编辑成果丢失 |
| C-06 | 导出 PNG 必须覆盖全图，不允许只导出当前视口 | MUST | `diagramExportPng.ts` | 导出图不完整 |
| C-07 | 自动边必须可编辑（可选中/删除/重连） | MUST | `buildGraph.ts`, `App.tsx` | 画布退化为只读 |
| C-08 | Ingress↔Istio Gateway 自动边必须走“同名 + URI 相交”规则 | MUST | `buildGraph.ts`, `istioIngressPathMatch.ts` | 误连或漏连 |
| C-09 | Ingress 分层转发边在 tier 模式仅允许前向相邻层（01→02, 02→03） | SHOULD | `buildGraph.ts` | 视觉噪声过高 |
| C-10 | 全局 UI 缩放必须限制范围并持久化 | SHOULD | `App.tsx`, `index.css` | 页面失真/用户体验不稳定 |
| C-11 | 登录门禁行为由运行时 `/config.json` 控制，不写死在构建期 | MUST | `runtimeConfig.ts`, `AuthGate.tsx` | 环境切换不可控 |
| C-12 | 支持多文件/多文件夹追加导入，并按相对路径去重 | MUST | `mergeYamlBundles.ts`, `App.tsx` | 示例分层与来源绑定失效 |

### 11.1 约束变更流程（必须执行）

1. 提出约束变更时，先标注受影响模块（解析/构图/渲染/导出/持久化/鉴权）。
2. 同一 PR 必须同时更新：
   - 实现代码
   - 本文 `Constraint Register`
   - `HARNESS_ENGINEERING.md`（若属于验收行为）
3. 至少补 1 条对应测试（单元或 e2e）。
4. PR 描述中写明：约束 ID、变更原因、回归范围。

### 11.2 新增约束模板

复制以下模板追加到 Register：

```md
| C-XX | <约束描述> | MUST/SHOULD | <文件路径> | <违反后果> |
```

---

## 12. 审查清单（Code Review Checklist）

提交涉及核心功能时，评审至少检查：

1. 是否触碰 `C-04`（handle id 一致性）导致边渲染风险。
2. 是否触碰 `C-05/C-07` 导致编辑能力退化。
3. 是否触碰 `C-06` 导致导出截断。
4. 是否触碰 `C-08/C-09` 导致跨区自动连线语义变化。
5. 文档是否同步（本文 + `HARNESS_ENGINEERING.md`）。
