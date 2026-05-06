# traffic-route-viz 工程规格（可视化 / 交互 / 验收）

这份文档用于把“画图工具”的需求固化为**可执行的工程条款**。以后进行 Vibe Coding 时，请先把本文件 `@` 给 AI/Agent，要求严格按本文实现与验收。

---

## 目标与范围

- **目标**：把 Kubernetes YAML（至少包含 `Ingress` / `Service` / `Endpoints`）解析成**可交互拓扑图**，用于快速理解流量入口与后端服务/实例关系。
- **范围内**：
  - `Ingress`（`networking.k8s.io/v1`）
  - `Service`（`v1`）
  - `Endpoints`（`v1`）
- **范围外（后续扩展）**：
  - `Gateway API`（`HTTPRoute` 等）
  - `EndpointSlice`
  - 跨 namespace 引用（除非明确建模）

---

## 输入与导入体验（UI/UX）

### 多文件导入

- **必须支持**：一次选择多个 `.yaml/.yml` 文件。
- **必须支持**：拖拽多个文件到导入区域（dropzone）。
- **合并策略**：多文件按 `---` 作为分隔符拼接后解析（多文档 YAML）。
- **导入后行为**：
  - 自动将合并后的内容填入左侧文本区（便于编辑/复核）。
  - **自动触发解析并刷新图表**（减少多一步点击）。
- **导入状态展示**：
  - 显示“已导入 N 个文件”。
  - 显示文件名列表（可只展示前 3 个并折叠）。

### 文本输入

- 允许用户直接粘贴 YAML。
- 点击“解析并刷新图表”后更新画布（手动刷新仍保留）。

---

## 图的语义模型（需要映射到节点/边）

### 节点类型（当前四类）

1. **Ingress 节点**
2. **Host 节点**
3. **Route 节点**（每条 path 一节点，用于避免边标签重叠）
4. **Service 节点**
5. **Endpoints 节点**

> 可扩展，但新增类型时需同步更新：解析 → 构图 → 节点 UI。

### 边的语义

- `Ingress -> Host`：表示 ingress rule host 入口（可 animated）。
- `Host -> Route -> Service`：每条 path 一条路由，避免大量 edge label 堆叠不可读。
  - Route 节点必须展示：`path` / `pathType` / `backend service + port`
- `Service -> Endpoints`：表示该 service 的后端实例（Pod IP 等）。
  - 标签：`Pod IP`（或更精确语义）。

---

## 节点必须展示的“核心信息”

### Ingress 节点

- **Ingress name**
- **namespace**
- **ingressClassName**
- **LB / status IP**（来自 `status.loadBalancer.ingress[].ip/hostname`）
- **TLS**（来自 `spec.tls[]`）：
  - secretName
  - hosts 列表

### Host 节点

- host（域名）
- 所属 ingress name
- **TLS secret（按 host 匹配）**：
  - 从 `Ingress.spec.tls[].hosts` 与 rule host 匹配
  - 未匹配时显示“无匹配证书（或未配置 TLS）”

### Service 节点

- service name
- namespace
- `spec.type`
- `spec.clusterIP`
- `spec.ports`（port / targetPort）
- **Ingress backend 端口**（来自 Ingress backend service port）

### Endpoints 节点

- service name（上下文提示）
- addresses（Pod IP 列表）
- ports（port/protocol）

---

## 布局与可读性（重点：避免重叠、区分 ingress）

### Ingress 分区（必须）

同一张画布内存在多个 Ingress 时，必须做到：

- **不同 Ingress 必须视觉上区分开**（推荐“分区/泳道”的概念）。
- **禁止**：不同 Ingress 的 Host/Service/Endpoints 节点被合并为同一个节点导致归属不清。

实现建议（当前采用）：在 `Node.id` 中引入 ingress scope（例如 `svc-<ingressScope>-<svcKey>`），并在 x 轴上为每个 ingress 分配独立 block。

### 区域更明显（建议）

- 每个 Ingress 分区建议渲染一个**背景区域块**（Region/Group node）：
  - 半透明背景 + 边框 + 标题（Ingress 名称）
  - 仅用于视觉分隔，不改变边语义

### 避免重叠（必须）

- 初始布局必须在常见数据量下可读：
  - 2 个 ingress
  - 每个 ingress 2~5 个 host
  - 每个 host 1~10 条 path
- 节点之间必须有足够垂直间距（建议 row gap ≥ 80px）。
- **Host/Service 栈**建议更大间距（建议 row gap ≥ 120px），避免边标签与卡片互相遮挡。
- 画布必须支持缩放、平移、小地图（React Flow 自带即可）。

---

## 视觉与样式（格式化要求）

- 节点卡片需要：
  - 标题（Ingress/Host/Service/Endpoints）
  - 关键字段加粗（name/host 等）
  - 次要字段用更小字号/浅色（namespace、class、type 等）
- “上传/导入”区域需要：
  - 明显的拖拽边框（dashed）
  - 清晰的状态反馈（导入了哪些文件）
  - 尽量减少用户操作步骤（导入即刷新）

---

## 错误处理与提示

- YAML 解析错误要在 UI 显示（红色区域，支持多条）。
- 数据缺失要“可解释”：
  - 没有 `Service/Endpoints` 时不强行补图，但要让用户能理解为什么只画到 service 名。
  - `TLS` 未配置时要在节点里写明（不是空白）。

---

## 验收标准（Definition of Done）

### 功能

- [ ] 多文件拖拽/选择可用；导入后自动刷新图。
- [ ] 节点展示字段符合“核心信息”要求（Ingress/Host/Service/Endpoints）。
- [ ] 多 ingress 时，图上能一眼看出“这是两个 ingress”，且不会互相混淆归属。
- [ ] 画布交互可用：拖拽节点、缩放、平移、小地图/控件。

### 可读性

- [ ] 默认初始化示例打开即可展示多 ingress 分区与 TLS/LB/Endpoints 信息。
- [ ] 常见规模下（上文 2 ingress * 多 host/path）不出现大面积重叠。

### 工程

- [ ] `npm run build` 通过
- [ ] 无新增 lints（或已解释并处理）

---

## 代码入口（实现位置）

- **解析**：`web/src/k8sParser.ts`
  - Ingress TLS / LB IP 提取、Service/Endpoints 解析
- **构图/布局**：`web/src/buildGraph.ts`
  - Ingress 分区、节点/边生成、避免跨 ingress 合并
- **节点 UI**：`web/src/FlowNodes.tsx`
  - 核心字段展示、格式化
- **导入与页面 UI**：`web/src/App.tsx`
  - 多文件选择、拖拽导入、自动刷新、错误提示

