# traffic-route-viz 工程规格（可视化 / 交互 / 验收）

这份文档用于把“画图工具”的需求固化为**可执行的工程条款**。以后进行 Vibe Coding 时，请先把本文件 `@` 给 AI/Agent，要求严格按本文实现与验收。

**画布（React Flow 拓扑）**的各项约束以本文 **「画布 Harness 规格」** 为单一事实来源；其他章节若与画布冲突时以 Harness 为准并应回写修正本文。

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

### 节点类型（含分区底板）

1. **Ingress 分区底板**（父节点：`ingressRegion`）：视觉泳道 / 整块可拖，承载该 Ingress 下所有子节点。
2. **Ingress 节点**
3. **Host 节点**
4. **Route 节点**（每条 `path` 一节点，避免边标签重叠）
5. **Service 节点**
6. **Endpoints 节点**

> 可扩展，但新增类型时需同步更新：解析 → 构图 → 节点 UI、`App.tsx` 的 `nodeTypes`。

### 边的语义

- `Ingress -> Host`：表示 ingress rule host 入口（可 animated）。
- `Host -> Route -> Service`：每条 path 一条路由，避免大量 edge label 堆叠不可读。
  - Route 节点必须展示：`path` / `pathType` / `backend service + port`
- `Service -> Endpoints`：表示该 service 的后端实例（Pod IP 等）。
  - 标签：`Pod IP`（或更精确语义）。

---

## 画布 Harness 规格（React Flow · 拓扑视图）

本节为画布侧**单一事实来源**：实现以 `web/src/App.tsx`（宿主）、`web/src/buildGraph.ts`（构图）、`web/src/FlowNodes.tsx`（节点外壳）为准；改动画布行为时须同步修订本文。

### 页面结构

- 左侧：**YAML 输入 / 导入**（非画布条款见上文「输入与导入体验」）。
- 右侧：**拓扑画布**（React Flow）：点阵背景、`Controls`（缩放控件）、`MiniMap`（缩略导航）。

### 数据与刷新

- **首次加载**：画布由内置示例 YAML 经解析、构图初始化。
- **刷新**：点击「解析并刷新图表」，或导入多文件并成功合并解析后触发刷新时，按解析结果 **重新构图**、`nodes` / `edges` **整批替换**。用户上一次**拖拽节点**调整出的位置**不回写** YAML，也不在刷新后继承；画布**视口**平移 / 缩放一般由 React Flow 维持当前会话状态（宿主未主动 `fitView` 复位时）。

### React Flow 壳层（宿主约束）

必须与实现对齐并保持可用：

| 能力 | 要求 |
|------|------|
| 初始视图 | **fitView**：进入时可见整图主要内容。 |
| 缩放范围 | `minZoom`：约 **0.2**；`maxZoom`：约 **1.8**（与实现一致）。 |
| 背景 | **点阵**（`Background`），`gap` 约 **14** px。 |
| 控件 | 左下角 **Controls**（含缩放、复位视口）；右下角 **MiniMap**。 |
| 画布平移 / 缩放 | 支持拖拽空白处平移、滚轮缩放（React Flow 默认行为）。 |

> 画布上允许通过 `onConnect` **手工连线**（示教/草稿）；流量语义的主干边必须由 **YAML 构图**生成。

### 节点类型映射（`nodeTypes`）

| 节点角色 | React Flow `type` | 自定义组件（实现） |
|---------|-------------------|-------------------|
| Ingress 分区底板 | `ingressRegion` | `IngressRegionNode` |
| Ingress | `ingress` | `IngressNode` |
| Host | `host` | `HostNode` |
| Route | `route` | `RouteNode` |
| Service | `service` | `ServiceNode` |
| Endpoints | `endpoints` | `EndpointsNode` |

### Ingress 分区（父节点）语义与文案

同一画布存在多个 Ingress 时：

- **必须**在结构与视觉上区分：**禁止**跨 Ingress 合并 Host/Service/Endpoints 节点导致归属混淆。
- 实现上：**每个 Ingress** 对应一个 **`ingressRegion` 父节点**；其子节点在该 Ingress scope 下有独立 `id`（例如 `svc-<ingressScope>-<svcKey>`），并在 **x 轴**上为每个 Ingress 分配独立 **block**（`ingressBlockWidth`）。

分区标题栏（可读性：**文明用语 / 专业化命名**），建议包含：

1. **主标题**：「入口流量拓扑分区 · 第 **N** 视图」（**N** 为从 1 起的分区序号）。
2. **Ingress 标识**：明确写出 Kubernetes Ingress **资源名称**。
3. **命名空间**：使用「命名空间」字样（避免缩写 **`ns`** 作为对外主文案）。
4. **配置来源**：若 YAML 绑定导入文件名，列出 **配置文件名**（多文件时用顿号等方式分隔）；若为纯编辑器文本且无名，则说明「编辑器内 YAML、未绑定本地文件名」一类提示。
5. **操作提示**：说明可拖拽分区标题栏或底板以**整体平移**该组拓扑。

分区视觉：半透明底、描边圆角矩形；不改变边的语义（仅编排与分组）。

### 子节点挂载与拖拽策略

- 所有 **Ingress / Host / Route / Service / Endpoints** 节点的 `parentNode` 指向所属 **`ingressRegion`**。
- **`extent: 'parent'`**：子节点仅能在**本分区内**拖动，避免出现「节点拖出分区、边语义不清」的裸边观感。
- **分区底板**与各 **业务卡片** **`draggable: true`**：画布上凡解析生成的节点均需允许用户拖拽调整位置（在当前实现下子节点受限在父节点矩形内）。
- **标题栏留白**：构图时须在分区顶端为标题栏预留 **`regionHeaderReserveY`（像素）**，使得 **Ingress** 首张卡片与标题正文 **不发生重叠**。当前常量目标约 **168** px（随标题区复杂度可调，但必须满足「不重叠」验收）。

### 初始布局常量（构图契约，`buildGraph.ts`）

以下数值为实现契约；调整布局时应优先在此集中修改并回头更新本节。

| 常量含义 | 约值 / 规则 |
|---------|-------------|
| 基准列间距 `col` | **300** px |
| `hostGap` | **170** px（同一 Ingress 内相邻 Host 行间距） |
| `routeGap` | **64** px（同一 Host 下各 Route 垂直间距） |
| `serviceGap` | **150** px（多 Service **纵向防撞**，相邻 Service **中心距**下限） |
| 画布 Ingress 起始 `baseX` | **40** |
| Ingress 分区水平宽度系数 | **`col * 4`**（再减去实现边距后为分区可见宽度） |
| 分区相对画布起点 | 按 `blockIndex` × `ingressBlockWidth`；分区框相对 block 左上角外扩约 **24** px |
| Ingress 第一张卡片起始纵坐标 | `regionPos.y + regionHeaderReserveY`（整块链路垂直起点） |
| Host 垂直基准 | `layoutOriginY + 40 + hostIndex * hostGap` |
| Route 垂直偏移 | `hostY + 36 + routeIndex * routeGap` |
| 横向列偏移（Ingress 锚点为 `blockX`） | Host：`+ col`；Route：`+ col * 1.55`；Service：`+ col * 2.35`；Endpoints：`+ col * 3.15` |
| Service 纵向位置 | 各 Route 锚点集合的 **中位数**，再按 `serviceGap` 做 **从上到下防撞**排序 |
| 分区动态高度 | 最小约 **760** px；内容增高时 **`height = max(760, maxY − 常量偏置)`**（偏置以实现为准，目标为包住本区最底内容） |
| 边类型 | **`smoothstep`** |

### 边样式与动效（主路径）

| 段落 | stroke / 其他 |
|------|----------------|
| `Ingress → Host` | **`animated: true`**（流动感） |
| `Host → Route` | **`#7c3aed`** |
| `Route → Service` | **`#6366f1`**，边标签形如 `→ :<port>`，附标签背景提升可读性 |
| `Service → Endpoints` | **`#0d9488`**，边标签 **`Pod IP`** |

### 可读性验收场景（画布）

在上述布局与拖拽策略下，**初始布局**在常见规模下可读：

- 约 **2** 个 Ingress 分区并排；
- 每个 Ingress **2～5** 个 Host；
- 每个 Host **1～10** 条 path（Route）。

**禁止**：分区标题正文与首张 **Ingress** 卡片大面积重叠。

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

### Route 节点

- **path**
- **pathType**
- **backend**：后端 **Service** 名称与端口（Ingress rule 所指）

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

## 视觉与样式（格式化要求）

- 节点卡片需要：
  - 标题（Ingress/Host/**Route**/Service/Endpoints）
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
- [ ] 节点展示字段符合“核心信息”要求（含 **Ingress 分区底板文案**、Ingress/Host/**Route**/Service/Endpoints）。
- [ ] 多 ingress 时，图上能一眼看出“这是两个 ingress”，且不会互相混淆归属。
- [ ] **画布 Harness**：`fitView`、`minZoom`/`maxZoom`、点阵背景、Controls、MiniMap；平移画布；**分区与各业务卡片均可拖拽**；子节点 **`extent: 'parent'`**；**分区标题与首张 Ingress 不重叠**（见本文「画布 Harness 规格」）。

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
  - Ingress 分区、节点/边生成、初始坐标与边样式；避免跨 ingress 合并
- **节点 UI**：`web/src/FlowNodes.tsx`
  - 核心字段展示、格式化
- **导入与页面 UI**：`web/src/App.tsx`
  - 多文件选择、拖拽导入、自动刷新、错误提示

