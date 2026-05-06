# Harness Engineering Spec — traffic-route-viz

本文件是本项目的**工程规格与验收标准（DoD）**，并作为“画布 Harness（React Flow 拓扑）”的**单一事实来源**（Single Source of Truth）。

> 若实现与文档冲突：以本文件为准，并在同一变更中修正实现与文档保持一致。

---

## 1. Purpose（目标）

把 Kubernetes YAML（至少包含 `Ingress` / `Service` / `Endpoints`）解析成**可交互拓扑图**，用于快速理解入口域名/路径如何路由到后端服务与实例。

---

## 2. In/Out of Scope（范围）

### In Scope

- `Ingress`（`networking.k8s.io/v1`）
- `Service`（`v1`）
- `Endpoints`（`v1`）

### Out of Scope（除非明确扩展）

- Gateway API（`HTTPRoute` 等）
- `EndpointSlice`
- 跨 namespace 引用（除非明确建模并同步更新解析/构图/验收）

---

## 3. Glossary（名词）

- **画布 / Canvas**：右侧 React Flow 视图（节点+边+缩放/小地图）
- **分区 / Area / Region**：每个 Ingress 对应一个父节点 `ingressRegion`（紫色底板）
- **手写边 / Manual Edge**：用户通过拖拽手柄添加的边，`edge.data.manual === true`
- **画图文件 / Diagram File**：`*.traffic-viz.json`，用于保存/恢复会话

---

## 4. Input & Import UX（输入/导入）

### 多文件导入（必须）

- 支持一次选择多个 `.yaml/.yml`
- 支持拖拽多个文件到导入区域（dropzone）
- 合并策略：多文件以 `---` 拼接为多文档 YAML 解析
- 导入后行为：自动填入左侧文本区 + **自动触发解析刷新**
- 状态展示：显示“已导入 N 个文件”与文件名列表（可折叠）

### 文本输入（必须）

- 允许直接粘贴/编辑 YAML
- 点击“解析并刷新图表”后更新画布

---

## 5. Semantic Model（语义模型）

### 节点类型（含分区底板）

1. **Ingress 分区底板**（`ingressRegion`，父节点）：视觉泳道/整块可拖
2. **Ingress**
3. **Host**
4. **Route**（每条 `path` 一节点，避免边标签重叠）
5. **Service**
6. **Endpoints**

> 新增类型时必须同步：解析 → 构图 → 节点 UI → 宿主 `nodeTypes` → 本文档。

### 边的语义

- `Ingress → Host`：入口域名规则（可 animated）
- `Host → Route → Service`：每条 path 一条路由，Route 节点承载信息避免边标签堆叠
- `Service → Endpoints`：后端实例（Pod IP）

---

## 6. Must-Show Fields（节点展示字段）

### Ingress

- Ingress name
- 命名空间（namespace）
- ingressClassName
- LB/status IP（`status.loadBalancer.ingress[].ip/hostname`）
- TLS：`spec.tls[]`（secretName + hosts）

### Host

- host（域名）
- 所属 ingress name
- TLS secret（按 host 匹配 `spec.tls[].hosts`），未匹配显示“无匹配证书（或未配置 TLS）”

### Route

- path
- pathType
- backend：Service 名称 + 端口

### Service

- service name
- 命名空间
- type
- clusterIP
- spec.ports（port/targetPort）
- Ingress backend 端口（若可得）

### Endpoints

- service name（上下文）
- addresses（Pod IP 列表）
- ports（port/protocol）

---

## 7. Canvas Harness（React Flow · 单一事实来源）

### 7.1 页面结构

- 左侧：YAML 输入/导入
- 右侧：React Flow 画布（点阵背景、Controls、MiniMap、右上工具条）

### 7.2 React Flow 宿主约束（必须）

- 首次适配：`onInit` + `fitView`（padding 按实现），**不做**常驻自动 fit（避免打断用户）
- 缩放范围：`minZoom ≈ 0.2`，`maxZoom ≈ 1.8`
- 背景：点阵 `Background`（`gap ≈ 14`）
- 控件：Controls、MiniMap、右上 Panel（PNG/保存/打开）
- 画布平移/缩放：React Flow 默认交互可用

### 7.3 节点类型映射（`nodeTypes`）

- `ingressRegion` → `IngressRegionNode`
- `ingress` → `IngressNode`
- `host` → `HostNode`
- `route` → `RouteNode`
- `service` → `ServiceNode`
- `endpoints` → `EndpointsNode`

### 7.4 分区（Area）规则（必须）

- 多 Ingress 必须明显区分：**禁止跨 Ingress 合并** Host/Service/Endpoints
- 每个 Ingress 对应一个 `ingressRegion` 父节点；子节点 `parentNode` 指向该父节点
- Area 页眉必须包含：
  - 分区序号（第 N 视图）
  - Kubernetes Ingress 名称
  - 命名空间
  - **来源文件名列表**（导入时必须绑定；过长可省略但需可 hover 查看完整）

### 7.5 拖拽策略（必须）

- 分区底板与业务卡片均可拖拽
- 子节点使用 `extent: 'parent'`（仅在本分区内拖动）
- 分区标题与首张 Ingress 卡片**不得重叠**：预留 `regionHeaderReserveY`

### 7.6 手写连线（必须）

- 从节点 Handle 拖拽到另一节点可连线（推荐 `connectionMode.Loose`）
- 手写边样式：灰色虚线，`data.manual: true`
- 删除：选中后 Delete/Backspace 可删（默认行为）
- 解析刷新时：仍有效的手写边（两端节点仍存在且不与系统边重复）应被保留

### 7.7 PNG 导出（必须）

- 右上提供“导出 PNG”
- PNG 中排除：右上工具条、Controls、MiniMap、attribution
- 失败要有用户可读提示

### 7.8 画图会话文件（必须）

- 保存/打开：`*.traffic-viz.json`（UTF-8 JSON）
- `schemaVersion: 1` 至少包含：
  - `yamlText`
  - `importedFiles`（`null` 或 `{ name, text }[]`）
  - `activeFileIndex`
  - `nodes`、`edges`
  - `viewport`（`{ x, y, zoom }`）
  - `savedAt`（ISO 时间）
- 打开行为：恢复 YAML/导入上下文、nodes/edges、viewport，并刷新解析告警条

---

## 8. Layout Contract（初始布局契约，`buildGraph.ts`）

以下数值为实现契约；改动时需同步更新本节：

- `col`: **440**
- `hostGap`: **220**
- `routeGap`: **84**
- `serviceGap`: **210**
- `regionHeaderReserveY`: **168**
- 分区排版：**一行最多 4 个 Area**（超出自动换行），行/列间距为常量（见代码：`areaGapX/areaGapY`）
- 分区宽度：按内容 **动态扩展**（至少 `ingressBlockMinW`；按最右侧卡片估算宽度）
- 横向列偏移（Ingress 锚点为 `blockX`）：
  - Host：`leftPad + col * 1.12`
  - Route：`leftPad + col * 2.05`
  - Service：`leftPad + col * 3.10`
  - Endpoints：`leftPad + col * 4.22`
- 边类型：`smoothstep`

---

## 9. Definition of Done（验收标准）

### 功能

- 多文件拖拽/选择导入可用；导入后自动刷新图
- 节点展示字段符合本文件「Must-Show Fields」
- 多 ingress 分区清晰，归属不混淆
- 画布交互可用：拖拽节点/分区、缩放、平移、小地图/控件
- 手写连线可用：新增/删除/刷新后保留有效手写边
- PNG 导出可用
- 保存/打开 `*.traffic-viz.json` 可用（含 YAML/视口/边）

### 可读性

- 常见规模（2 ingress、每 ingress 2~5 host、每 host 1~10 path）初始布局不大面积重叠
- 连线可清晰辨认（横向/纵向间距足够）

### 工程

- `cd web && npm run build` 通过
- 无新增 lints（或已解释并处理）

