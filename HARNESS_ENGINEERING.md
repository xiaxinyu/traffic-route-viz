# Harness Engineering Spec — traffic-route-viz

本文件是本项目的**工程规格与验收标准（DoD）**，并作为“画布 Harness（React Flow 拓扑）”的**单一事实来源**（Single Source of Truth）。

> 若实现与文档冲突：以本文件为准，并在同一变更中修正实现与文档保持一致。

---

## 1. Purpose（目标）

把 Kubernetes / Istio / Contour YAML（至少包含 `Ingress` / `Service` / `Endpoints` 以及 Istio `VirtualService` / `DestinationRule`、Contour Gateway（`HTTPProxy`））解析成**可交互拓扑图**，用于快速理解入口域名/路径如何路由到后端服务与实例。

---

## 2. In/Out of Scope（范围）

### In Scope

- `Ingress`（`networking.k8s.io/v1`）
- `Service`（`v1`）
- `Endpoints`（`v1`）
- Contour Gateway（`HTTPProxy`, `projectcontour.io/*`）
- Istio `VirtualService`（`networking.istio.io/*`）
- Istio `DestinationRule`（`networking.istio.io/*`）

> 说明：当导入内容为 **Istio-only bundle**（仅含 VirtualService/DestinationRule/Gateway，且无 Service/Endpoints）时，画布进入 **Istio-only 视图**：
> - 不渲染 `Service` / `Endpoints` 节点
> - 以 `Route → Destination → DestinationRule` 为主链（权重在 Route→Destination 连线上）
> - 保留全局 `Gateway → VirtualService` 连线

### Out of Scope（除非明确扩展）

- Gateway API（`HTTPRoute` 等）
- `EndpointSlice`
- **资源级跨 namespace 依赖**的系统性建模（例如把任意跨 ns 的后端解析成一条完整、可校验的调用图）
  - **例外（仅可视化连线）**：`Service(gateway) → Istio Gateway` 的自动连线**只比较名称**，不按 namespace 对齐；这不等同于「已完成跨 namespace 引用的语义建模」，见下文 **§5.x**。

---

## 3. Glossary（名词）

- **画布 / Canvas**：右侧 React Flow 视图（节点+边+缩放/小地图）
- **分区 / Area / Region**：每个入口对象（Ingress / VirtualService / Contour Gateway）对应一个父节点 `ingressRegion`（紫色底板）
- **手写边 / Manual Edge**：用户通过拖拽手柄添加的边，`edge.data.manual === true`
- **画图文件 / Diagram File**：`*.traffic-viz.json`，用于保存/恢复会话
- **路由 / Route（匹配语义）**：画布上每条 `path`/`http` 规则对应的 Route 节点；在对比 Ingress 与 Istio VirtualService 是否表述**同一类入口流量规则**时，**以路由条目为最小匹配单元**，**不按 Host 分层聚合后再做一套独立匹配**（Host 仍是拓扑展示挂点，不承载「匹配分桶」职责）。

---

## 4. Input & Import UX（输入/导入）

### 多文件导入（必须）

- 支持一次选择多个 `.yaml/.yml`
- 支持拖拽多个文件到导入区域（dropzone）
- 支持**导入文件夹**（目录选择 + 拖拽文件夹），并在解析时保留每个文件的**相对路径**（用于 Example 分层布局与 Area “来源文件”绑定）
- 支持**多文件夹导入**：可一次拖拽多个文件夹，或多次点击选择不同文件夹进行“追加导入”（按相对路径去重）
- 合并策略：多文件以 `---` 拼接为多文档 YAML 解析
- 导入后行为：自动填入左侧文本区 + **自动触发解析刷新**
- 状态展示：显示“已导入 N 个文件”与文件名列表（可折叠）

### 文本输入（必须）

- 允许直接粘贴/编辑 YAML
- 点击“解析并刷新图表”后更新画布
- YAML 编辑区提供一级操作入口：文本统计（行数 / 文档数 / 字符数）、就地解析刷新、清空编辑、恢复示例、放大查看；空内容时解析刷新不可触发。

### 登录与发布（必须）

- 系统支持可选登录（Auth Gate）：
  - 默认开启：**不登录不得进入主界面**
  - 通过运行时 `GET /config.json` 控制（K8s 通过 ConfigMap 挂载）
  - `auth.enabled=true` 且配置 `username/password` 时启用登录页
  - 登录态存储在浏览器本地并支持“退出”
- 推荐发布形态：Vite build → Nginx 静态托管（Docker 多阶段构建）

#### 本地运行时登录配置（开发必备）

在 `web/` 目录准备 `public/config.json`（不要提交仓库，已在 `.gitignore` 中忽略）：

```bash
cd web
cp public/config.example.json public/config.json
```

修改 `public/config.json` 中账号密码后，启动：

```bash
cd web
pnpm run dev
```

#### Docker 编译镜像（必须可复现）

本项目部署目标为 **Linux amd64**。若你在 **macOS（尤其 Apple Silicon / arm64）** 上构建镜像，务必显式指定平台为 `linux/amd64`，避免“本地能跑、上服务器拉起失败/架构不匹配”。

在仓库根目录执行（使用 `web/Dockerfile`，构建上下文为 `web/`）：

```bash
docker buildx build --platform linux/amd64 -t traffic-route-viz:local -f web/Dockerfile web --load
docker run --rm -p 8080:80 traffic-route-viz:local
```

#### 推送 Harbor（示例）

```bash
docker login harbor.ms5-sit.aswatson.net:8080
docker buildx build --platform linux/amd64 \
  -t harbor.ms5-sit.aswatson.net:8080/hds-asw/traffic-route-viz:<TAG> \
  -f web/Dockerfile web --push
```

> 说明：`--load` 用于本地运行验证；`--push` 用于直接推送到 Harbor（无需先在本地保存镜像）。
>
> 推荐：
> - `<TAG>` 使用可追溯的版本化命名（例如 `v1.4.2`、`2026.05.07-<gitsha>`），避免长期依赖 `:latest`
> - 在 Kubernetes 清单中优先使用 `image: ...@sha256:<digest>` 锁定镜像（避免 tag 被覆盖导致回滚困难）

#### 部署到 Kubernetes（示例清单）

- 清单文件：`k8s/traffic-route-viz.yaml`
- 清单内包含：
  - `ConfigMap/traffic-route-viz-config`（挂载为站点根目录 `/config.json`，用于强制登录配置）
  - `Deployment/Service/Ingress`

应用：

```bash
kubectl apply -f k8s/traffic-route-viz.yaml
```

### 辅助导出脚本（可选）

- `tools/export-ingress-services.sh`：导出 Ingress + 关联 Service（按 Ingress 分文件）
- `tools/export-istio-vs-destinationrules.sh`：导出 VirtualService + 匹配的 DestinationRule（按 VS 分文件，默认输出到 `./<namespace>/istio/`；如需适配 01/02/03 分层导入，可显式指定 `--out-root traffic/example --tier 02 --group <namespace>-istio`）

---

## 5. Semantic Model（语义模型）

### 节点类型（含分区底板）

1. **Ingress 分区底板**（`ingressRegion`，父节点）：视觉泳道/整块可拖
2. **Ingress**
3. **Istio Gateway**（当 VirtualService 引用了 `spec.gateways` 时渲染；**同名 Gateway 合并为画布左侧全局节点**，标记 **Global**，并为每个 VirtualService 分区连入）
4. **Host**
5. **Route**（每条 `path` 一节点，避免边标签重叠；Istio HTTP **多 destination** 时在 Route 卡列出 **subset / weight**，并在 Route→Service 边上摘要）
6. **Service**
7. **Endpoints**
8. **DestinationRule**（Istio：挂载到对应 Service，展示 subsets/策略入口）

> 新增类型时必须同步：解析 → 构图 → 节点 UI → 宿主 `nodeTypes` → 本文档。

### 边的语义

- `Ingress → Host`：入口域名规则（可 animated）
- `Ingress → Ingress`（新增）：当两侧均为 `ingressClassName: nginx` 的入口层，且 Host/Path 规则存在语义相交时，允许自动绘制「Nginx 转发」边（用于 01/02 等分层入口转发链路展示）
- `Istio Gateway → VirtualService`：当 VirtualService 配置 gateways 时，须存在 **全局 Istio Gateway** 节点（按 Gateway **名称**合并），并由该节点连入对应 VirtualService 入口卡；分区内 **不再**重复堆叠多块同名 Gateway 卡
- `Host → Route → Service`：每条 path 一条路由，Route 节点承载信息避免边标签堆叠
- `Service → Endpoints`：后端实例（Pod IP）
 - `Service → DestinationRule`：策略/子集配置（虚线）
 - `Service(gateway) → Istio Gateway`（必须）：**Ingress backend Service 短名 ≡ Gateway CR 短名**，且两侧 **Ingress path 规则与 Istio VS HTTP URI 规则（Prefix/Exact/Regex）存在语义相交**；见 **§5.1**（**P1、P6、P5**，不按 namespace）。

---

### 5.1 原则沉淀：Ingress 侧 Service 与 Istio Gateway（跨 Area 自动连线）

以下为本项目在 **Ingress（或等价入口）backend → 网关 workload** 与 **Istio VirtualService 所挂载 Gateway** 之间自动连线的 **唯一口径**（评审 / 验收 / 用户预期均以此为准）：

| 编号 | 原则 | 说明 |
| --- | --- | --- |
| P1 | **同名前提（必要）** | **Kubernetes Service `metadata.name`** 与 **`spec.gateways` 中 Gateway 资源名**（`ns/gateway-name` 取 **`gateway-name`**；无 `/` 时整段为名）在 **忽略大小写** 下须相等；**仅靠同名不足以连线**，尚需 **P6**。 |
| P2 | **不设 namespace 前提** | **不得**将 Service 与 Gateway CR 是否处于 **同一 namespace** 作为连线条件；**不存在**「必须同 namespace 才连」等与 **P6** 并列的备选策略。 |
| P3 | **路由是匹配语义的最小单元** | **P6** 中路径比对以 **Ingress 每条 path / VirtualService 每条 HTTP URI 规则** 为粒度；**不按 Host 分层聚合后再匹配**。Host 仍为拓扑展示挂点。 |
| P4 | **Service 节点与清单对齐（展示用）** | Ingress backend 推断 namespace 与真实 `Service` 不一致时：若导入清单中 **同名仅出现一次**，归并到该 `ns/name` 以对齐 ClusterIP / Endpoints；**P6** 中「指向该网关 backend」的规则仍按归并后的 `serviceKey` 收集。 |
| P5 | **多 Ingress × 多 Istio Gateway（M×N）** | 在满足 **P1 + P6** 的前提下，对 **每一个** Ingress 分区内指向该 `serviceKey` 的 **Service 节点实例**，与 **每一个** Istio Gateway 节点（其名与 backend 同名）所在 **VirtualService 分区** 逐个判定；**通过者全连线**，不因「已有代表节点」而省略。VirtualService 分区内下游业务 Service 不参与此自动边。 |
| P6 | **URI 规则相交（充分·路径维）** | 对候选 **Ingress 分区** × **VS 分区**：取 Ingress 侧 **凡 backend 为该 `serviceKey` 的规则**（`spec.rules[].http.paths[].path` + `pathType`）；取 VS 侧 **该分区全部 HTTP URI 匹配**（`spec.http[].match[].uri.prefix|exact|regex` 映射为 **Prefix / Exact / Regex**）。若存在 **任意一对** Ingress 规则与 VS 规则，二者在路径上 **`Exact`/`Prefix`/`Regex` 语义下可能同时命中某一请求路径**，则判定相交并允许连线。**ImplementationSpecific**：Ingress 侧按 **Prefix 近似** 处理（与实现一致）。**URI 省略或 Istio `"*"`**：视为匹配任意路径（与单侧全线相交）。Regex 侧使用 `RegExp` 及对 Ingress Prefix 的 **采样路径** 做保守检测；无法解析的正则则不判相交。判定实现见 **`web/src/istioIngressPathMatch.ts`**，`buildGraph.ts` 负责分区与路由收集。 |

> **实现注意**：`Service → Istio Gateway` 在 `web/src/buildGraph.ts` 中仅在 **P1 ∧ P6**（及 **P5** 的 M×N 展开）成立时绘制；**P3** 仍约束「不写 Host 分桶匹配」。若需关联但自动规则未命中，用手写边补充。

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
- Istio VirtualService：**全部 `route[].destination`** 的 host / port / **subset** / **weight**（Route 卡列表 + Route→Service 边摘要）

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

### 7.0 画布原则清单（必须，供评审/回归快速核对）

以下为本项目在多轮迭代中沉淀出的**硬原则**。任何布局/解析/节点语义变更，均不得破坏这些原则；若确需调整，必须同步更新本条款与实现并给出理由。

- **通用 Traffic 可视化定位**：面向 Kubernetes / Istio / Contour 的流量拓扑，不局限于 Ingress。
- **Area（分区）呈现**：一行最多 4 个 Area，超出自动换行；Area 宽高 **初始** 按内容动态扩展，避免内容溢出遮挡；用户 **可选中后拖动边缘/角点** 再放大留白（`NodeResizer`，`IngressRegionNode`）。**刷新拓扑** 时同一 `nodeKey` 的分区取 **`max`（用户当前宽高，重算宽高）**，避免把用户拉宽的底板缩回；导入新 YAML 导致分区消失时无此保留。
- **防重叠初始布局（必须）**：自动构图时同一 `ingressRegion` 内 **禁止** Ingress/VirtualService 卡、Host、Route、Gateway、Service、DestinationRule、Endpoints 等卡片在初始坐标上互相压盖。
  - **Route 不得在 Host 卡内部起笔**：首张 Route 的 `y` 必须位于为该 Host **预留的整块卡片估算高度之下**再加间隙（不得再使用 Host 顶端 + 极小偏移的旧模式）。
  - **多 Host 纵向串联**：下一个 Host 的顶边必须在前一 Host **子树底边**（该 Host 下最后一条 Route 的底边，或「无 Route 时」Host 卡底边）**再加块间留白**之后开始；**禁止**仅用固定常量 `hostGap` 推导而不考虑上一 Host **实际路由条数**。
  - **Istio Gateway（全局合并）**：凡 VirtualService 引用的 Gateway（过滤 `mesh`）在画布 **左侧独立列**按名称合并为全局节点；初始纵向位置按名称占位堆叠后，在 **全部 VS 分区定位完成** 后再做一次 **垂直居中**：使每个全局 Gateway 卡片的垂直中心与「所有与之相连的 VirtualService 分区（`ingressRegion`）」垂直中心的 **中位数**对齐（多块 Gateway 名称时各自独立计算）；**分区宽度预留**左侧 Gateway 列，避免与分区重叠；Host 带起始高度仍与 **Ingress/VirtualService 头条 + 估算底边**对齐（分区内不再叠放多块 Gateway 卡）。
  - **Gateway→VS 连线长度（必须）**：全局 Gateway 的 **x** 不固定死在 `baseX`。在所有 VS 分区定位完成后，Gateway 节点 **自动贴近其连接到的 VS 列左侧**：\(x = \max(baseX,\; \min(\text{connected VS region }x) - (\text{gwCardW} + gap))\)。这样当 VS 列更靠左/靠右时，连线会自动变短/变长，避免永远拉一根超长线。
  - **VirtualService 竖列**：当 bundle 内存在 **至少一条** VirtualService 引用非 `mesh` 的 Istio Gateway，或 **VirtualService 入口对象 ≥ 2** 时，各 VirtualService 分区在画布上置于 **`01/02/03` Example 三列右侧的第四列**（与 Ingress / HTTPProxy 分区列分离），按导入排序 **纵向堆叠**；非 tier 导入时同样使用该竖列（与 fallback 网格中的 Ingress 分区分离）。
  - **画布泳道（启发式）**：依据导入路径推断 **Global / Worker / 默认** band（实现：`web/src/swimlaneInfer.ts`）；同一 Example tier 列内若 band 切换，插入额外垂直间距（`SWIMLANE_BAND_GAP`）；分区页眉展示 **泳道文案**（`swimlaneLabel`），与现有 `Level 01–03`、文件夹 hint 并存。
  - **多 Service**：在按 Route `y` median 初值对齐后，须按 **预估 Service 卡高 + gap** 做纵向碰撞-resolve，并保持 **DestinationRule** 占位在对应 Service **估算高度之下的独立留白带**。
  - **常量与节点 UI 同步**：估高常量定义于 `web/src/buildGraph.ts`（`LAYOUT_EST_*`）；若 **`FlowNodes.tsx`** 卡片内边距/字体/可选字段显著变高或变矮，须在 **同一 MR** 内调整估算并在此处更新本条说明意图（避免再次出现结构性重叠）。
  - **边线视觉**：初始布局以降低节点重叠为第一目标；多层边仍可共用出口点，但通过 **拉大列距与纵向间距** 减轻「糊成一束」的阅读问题。**并行边散开（必须）**：对汇入同一目标端点的 **≥ 2** 条自动连线（按 **`target/targetHandle/sourceHandle`** 分组；含多 `istioDestination` → 同一 `service` 的场景），`buildFlowGraph.ts` 在包装 `readableLabel` 前将它们转为 **`step` 路径**并按边 `id` 稳定排序对称分配 **`pathOptions.offset`**（相邻间距约 **14px**），使多条并排蓝线可区分；手写边不受影响。
- **文件名绑定**：导入文件后，Area 页眉必须展示来源文件名（不可出现“未绑定”状态）。
- **Example 分层布局（必须）**：当导入的文件路径中存在 `01-*/02-*/03-*` 这样的 tier 目录时，Area 必须按层级固定到三列泳道：
  - `01-*`：最左列
  - `02-*`：中间列
  - `03-*`：最右列
  - 满足 **VirtualService 竖列** 条件时，在以上三列的 **右侧** 增加 **第四列** 专用于 VirtualService 分区（Ingress / HTTPProxy 仍只占前三列）。
  - 同一列：**每行最多 1 个 Area**（超出则纵向堆叠）
  - `Active01` 必须排在 `Active02` 上方（同一列内排序规则）
  - 页面与 Area 标题中展示“有效文件夹信息”时，不应把 `01/02/03` 这种数字前缀当作业务信息展示（可做成 Level 标识或隐藏前缀后的展示）
- **可编辑性（必须）**：画布是“可操作的工作台”，不是只读报表。用户能通过拖拽与手写边对拓扑进行补全与整理。
  - **Area 可拖拽 / 可调尺寸**：`ingressRegion`（分区底板）必须可拖拽；**选中后出现缩放手柄**，可拉宽拉高浅蓝底板。拖拽分区会带动其下所有子节点一起移动（保持相对布局）。
  - **节点可拖拽**：分区内所有业务节点（Ingress/VirtualService/Istio Gateway/HTTPProxy/Host/Route/Service/Endpoints/DestinationRule）必须可单独拖拽（允许用户整理布局、避免遮挡）。
  - **手写连线**：所有业务节点必须提供可见连接手柄（至少左右各一），允许用户在任意两节点之间手动拉线建立关联。
  - **手写边可持续**：解析刷新/重新构图后，只要两端节点仍存在，手写边必须保留（丢失会破坏用户工作成果）；若端点消失则对应手写边应自动剔除。
  - **手写边契约（必须，供持久化/合并）**：
    - **数据标记**：手写边必须满足 `edge.data.manual === true`（用于在自动重算边时保留/去重）。
    - **ID 约定**：手写边 `id` 推荐以 `manual-` 前缀生成（便于排查与区分来源）。
    - **视觉样式**：手写边必须与系统自动边可视化区分，至少包含：
      - 灰色描边（例：`stroke: #475569`）
      - 虚线（例：`strokeDasharray: "6 4"`）
      - 末端箭头（例：`markerEnd` 颜色与 stroke 一致）
    - **连接线预览**：拖拽连线时的连接线（connection line）应为中性灰色，避免与业务语义边颜色混淆。
- **手写边**：允许手柄拖线；手写边视觉区分（灰虚线）且在解析刷新后只要两端仍存在就应保留。
  - **可连线性（必须）**：画布中所有业务节点（Ingress/VirtualService/Istio Gateway/HTTPProxy/Host/Route/Service/Endpoints/DestinationRule）都必须提供可见的连接手柄（至少左右各一），确保用户可手动关联任意两节点（含跨 Area）。
  - **Istio 网关跨区连线（必须与 §5.1 一致）**：**同名（P1）** + **URI 规则相交（P6）**；**禁止**仅以 namespace / Host 分桶决定是否连线。**M×N（P5）** 只对通过 **P6** 的 **（Ingress Service 结点 × Istio Gateway 结点）** 对连线。
  - **路由粒度（语义）**：**P6** 的比对落在 **Ingress path + pathType** 与 **VS `uri.prefix|exact|regex`**；不按 Host 做匹配分桶。
  - **Ingress 分层转发（必须）**：在 Example 分层（`01/02/03`）中，若两个 Ingress 分区 Host+Path 有重叠，允许自动连 `Nginx 转发`；为避免噪声，分层场景仅绘制相邻层前向边（`01→02`、`02→03`）。
- **节点语义配色（必须）**：`web/src/FlowNodes.tsx` 的 `NODE_COLOR_PALETTE` 为配色单一事实来源，要求 `ingress / host / service / virtualService / destinationRule / route / httpProxy` 使用**可区分且协调**的固定语义色，不因 `01/02/03` 层级改变语义色。
  - ingress：`#4f46e5`
  - host：`#c026d3`
  - service：`#2563eb`
  - virtualService：`#0284c7`
  - destinationRule：`#be185d`
  - route：`#d97706`
  - httpProxy：`#0f766e`
- **第三方导出**：提供 PNG；并支持导出 Mermaid / draw.io 以便第三方工具打开（画图会话文件为 React Flow JSON）。
- **Contour Gateway 强制原则**：
  - **链路**：Ingress → Service → Contour Gateway（跨 Area 连线也必须稳定出现，不能因构图顺序缺失）。
  - **布局**：Contour Gateway Area 内部组件顺序必须为：Contour Gateway → HTTPProxy → Host → Route → 上游 Service → Endpoints（Pod IP）。

### 7.1 页面结构

- 左侧：YAML 输入/导入
- 右侧：React Flow 画布（点阵背景、Controls、MiniMap、右上工具条）
- 右上工具条必须把高频动作作为一级按钮展示，不依赖折叠菜单：边标签开关、适配视图、导出 PNG、导出 Mermaid、导出 draw.io、保存/打开画图文件、删除选中连线/元素，并显示当前选中节点/边数量。

### 7.2 React Flow 宿主约束（必须）

- 首次适配：`onInit` + `fitView`（padding 按实现），**不做**常驻自动 fit（避免打断用户）
- 缩放范围：`minZoom ≈ 0.2`，`maxZoom ≈ 1.8`
- 背景：点阵 `Background`（`gap ≈ 14`）
- 控件：Controls、MiniMap、右上 Panel（一级画布工具条：PNG/Mermaid/draw.io 导出、保存/打开、删除选中、边标签开关、适配视图）
- 画布平移/缩放：React Flow 默认交互可用

### 7.3 节点类型映射（`nodeTypes`）

- `ingressRegion` → `IngressRegionNode`
- `ingress` → `IngressNode`
- `host` → `HostNode`
- `route` → `RouteNode`
- `istioDestination` → `IstioDestinationNode`（仅当 VirtualService `route` 有多条 `destination` 时插入；**权重在 Route→Destination 连线上**）
- `service` → `ServiceNode`
- `endpoints` → `EndpointsNode`

### 7.3.1 视觉识别系统（必须）

目标：**缩放后也能一眼分清节点类型与链路语义**；任何 UI 调整不得破坏以下视觉规则。

#### 节点（Cards）视觉规范

- 统一卡片基底：白底、轻边框、轻阴影（专业/可读）
- 每类节点必须具备“强身份标识”：
  - **左侧 5px 色条**（主色）
  - **标题行**：类型名 + 角标（pill）/关键属性（如 pathType、Service type）
  - 关键字段分组展示（避免信息堆在一行）

节点主色（实现契约）：

- Ingress（K8s）：`#4f46e5`
- VirtualService（Istio）：`#0ea5e9`
- Contour Gateway / HTTPProxy（Contour）：`#0f766e`
- Host：`#7c3aed`
- Route：`#6d28d9`
- VirtualService Destination（中间节点）：`#0e7490`（`istioDestination`）
- Service：`#4f46e5`
- Endpoints：`#0d9488`

#### 边（Edges）视觉规范

- 自动边：必须带 **箭头**（markerEnd），让方向一眼可读
- 不同语义链路必须用不同颜色（避免“全部一条颜色看不懂”）
- 手写边必须与自动边明显区分

边语义 → 样式（实现契约）：

- `Ingress/Contour Gateway/VirtualService → Host`：紫色 `#7c3aed`，加粗，可 animated，带箭头
- `Host → Route`：紫色 `#7c3aed`，加粗，带箭头
- `Route → Service`：靛蓝 `#4f46e5`，加粗，带箭头（端口 label 使用浅底色以便阅读）
- **`Route → istioDestination`**：靛蓝 `#4f46e5`；**连线 label 仅展示权重**（如 `w=80`），不设子集 pill
- **`istioDestination → Service`**：靛蓝 `#4f46e5`；label 含 **端口 + subset**（用于与并行边去重区分；权重不在此段重复）
- `Service → Endpoints`：青绿 `#0d9488`，加粗，带箭头
- `Service → Contour Gateway`（跨 Area）：深绿 `#0f766e`，**虚线**（dash），加粗，带箭头
- **手写边（Manual Edge）**：灰色 `#475569`，**虚线**，带箭头，`edge.data.manual === true`

### 7.4 分区（Area）规则（必须）

- 多入口对象（Ingress / VirtualService）必须明显区分：**禁止跨入口对象合并** Host/Service/Endpoints
- 每个入口对象对应一个 `ingressRegion` 父节点；子节点 `parentNode` 指向该父节点
- Area 页眉必须包含：
  - 分区序号（第 N 视图）
  - 入口对象类型与名称（Kubernetes Ingress / Istio VirtualService）
  - 命名空间
  - **来源文件名列表**（导入时必须绑定；过长可省略但需可 hover 查看完整）

### 7.4.1 Contour Gateway 原则（必须）

对 Contour Gateway（`HTTPProxy`）的可视化必须遵循以下**强制链路与布局原则**：

- **原则链路**：Ingress → Service → Contour Gateway  
  - 解释：Ingress 分区中出现的 gateway Service（例如 `envoy-rbac-gateway-gtw`）必须通过一条边连接到 Contour Gateway 分区内的 Contour Gateway 节点。
  - 该边为**跨 Area 连线**时必须稳定出现：构图顺序不能影响其生成（必要时延迟补边）。
- **布局原则**（必须）：Contour Gateway Area 内部严格按以下顺序排布（从左到右）：  
  **Contour Gateway → HTTPProxy → Host → Route → 上游 Service → Endpoints（Pod IP）**  
  该顺序用于确保读图的一致性与可解释性，禁止改回“流式/随意摆放”。

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

- 右上一级工具条提供“导出 PNG”
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

- `col`: **505**
- `hostGap`: **220**
- `routeGap`: **84**
- `serviceGap`: **210**
- `regionHeaderReserveY`: **162**（含分区页眉可选泳道一行；与 `web/src/buildGraph.ts` 一致）
- `SWIMLANE_BAND_GAP`: **100**（同一 tier 列内 swimlane band 切换时的额外垂直间距）
- `lanePitchX`: **round(col × 7.2) + areaGapX**（与代码一致；用于 Example tier 列距及 VS 竖列）
- **VirtualService 竖列**：在 Example tier 画布上为第四列，分区锚点 **x = baseX + layoutOffsetX + 3 × lanePitchX**；与 **`layoutOffsetX`**（全局 Istio Gateway 预留列宽） additive
- 分区排版：**一行最多 4 个 Area**（超出自动换行），行/列间距为常量（见代码：`areaGapX/areaGapY`）
- 分区宽高：按 **`max(布局游标 maxX/maxY, 子节点包围盒)` + 留白** **动态计算**（至少 `ingressBlockMinW` × `regionMinHeight`）；子节点脚印与 `Route` / `istioDestination` / `Service` / `DestinationRule` 等 **估宽估高规则** 与初次落点一致，避免长 VS、多 Route、DR 叠在 Service 下方时 **Area 过小**。
- 横向列偏移（Ingress / 常规 VirtualService 单列 destination）：
  - Host：`leftPad + col * 1.12`
  - Route：`leftPad + col * 2.05`
  - Service：`leftPad + col * 3.42`
  - Endpoints：`leftPad + col * 4.22`
- **VirtualService 且存在拆分 `istioDestination`（多条 destination）**：**不再**仅用 `col * 系数` 放置中间列 —— Route 卡 `maxWidth`≈**352** 会吃掉列距。**Destination / Service / Endpoints** 按下式锚定（与代码常量一致）：`istioDestination.x = routeX + 352 + 182`；`service.x = istioDestination.x + 308 + 156`；Endpoints 再相对 Service 右缘留白 **88px**。
- **Istio 多 destination 堆叠**：`LAYOUT_EST_ISTIO_DEST_H` **124**（下限；**长 FQDN / subset** 会加价），纵向间隙 `LAYOUT_ISTIO_DEST_STACK_GAP` **42**；Route **行间**额外间隙 `LAYOUT_ROUTE_STACK_GAP` **58**（见 `web/src/buildGraph.ts`）
- **可读性与缩放**：画布区（`.flow-stage`）与左侧栏共用 **`--ui-scale`**；顶栏 **A+/A−** 可同时放大/缩小 YAML 与拓扑节点文字（默认约 **108%**，上限 **150%**，`localStorage`：`trv.ui.scale`）。
- **VirtualService Route 行距**：在 `LAYOUT_EST_ROUTE_CARD_H` 基线之上，按 **path 行数（窄卡折行假设）/ queryParams / headers / 内嵌 Destinations** **动态估高**，避免长 Regex、多 header 卡片与下一行 Route 重叠。
- **分区留白**：`regionPadBottom` **72**、`regionPadRight` **64**；**不再**使用过高的固定高度地板（旧 `620`），代之以 `regionMinHeight` 与内容包围盒。
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

- `cd web && pnpm run build` 通过
- 无新增 lints（或已解释并处理）
