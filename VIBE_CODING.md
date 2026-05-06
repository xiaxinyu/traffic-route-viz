# Vibe Coding 沉淀手册

面向 **和 AI 一起、快速迭代、少开会多产出** 的工作方式：把「对话里一闪而过的细节」落到纸上，下次打开仓库还能接上上下文，而不是只依赖聊天历史。

---

## 这份文件用来做什么

| 用途 | 说明 |
|------|------|
| **接上下文** | 新人或未来的自己：5 分钟知道在造什么、技术选型和禁区。 |
| **记决策** | 为什么选 A 不选 B；推翻旧决策时写一句日期和原因。 |
| **会话流水** | 每次重要会话结束时，补几行「做了什么 / 卡在哪 / 下一步」。 |
| **喂给 AI** | 把本文件相关章节 `@` 进对话，减少重复解释。 |

---

## 使用方式（建议养成习惯）

1. **开干前**：扫一眼「当前焦点」「未完成」。
2. **会话末**（5 分钟）：更新「会话日志」+ 若有架构/命令变更则改对应节。
3. **大决定**：写进「决策记录」，一句话即可。
4. **和 Cursor/Agent 协作**：在 User Rules 或首条消息里写：`请先读 VIBE_CODING.md 里与本任务相关的节`。

---

## 项目速览（traffic-route-viz）

| 项 | 内容 |
|----|------|
| **目标** | 把 Kubernetes **Ingress / Service / Endpoints** 等 YAML 解析成 **可交互拓扑图**（类 draw.io：拖拽、缩放、连线），便于看流量与后端关系。 |
| **前端栈** | Vite 6 + React 18 + TypeScript + **React Flow**（`reactflow`）+ **`yaml`** 多文档解析。 |
| **应用目录** | `web/`（`npm run dev` / `npm run build`）。 |
| **示例数据** | `traffic/rbac/*.yaml`（如 `dce5-active01.yaml`、`kpanda-global-cluster.yaml`）。 |
| **数据流** | YAML 文本 → `k8sParser.ts` → `buildGraph.ts` → React Flow `nodes` / `edges` → `FlowNodes.tsx` 自定义节点。 |

---

## 工程规格（可执行要求）

- 进行任何可视化/布局/导入体验相关的改动前，请先阅读：`ENGINEERING_REQUIREMENTS.md`
- Vibe Coding 开始时建议直接贴这段：

```
请先读 @ENGINEERING_REQUIREMENTS.md ，严格按其中的「画布 Harness 规格」「核心信息」「导入体验」「验收标准」实现；画布相关条款一律以 Harness 小节为准。
```

---

## 目录与关键文件

```
traffic-route-viz/
├── ENGINEERING_REQUIREMENTS.md ← 工程规格 / 验收标准（优先级最高）
├── VIBE_CODING.md          ← 本文件（沉淀）
├── README.md               ← 项目说明 / 快速开始
├── CONTRIBUTING.md         ← 贡献指南 / 提交前检查
├── docs/adr/               ← 架构决策记录（ADR）
├── traffic/rbac/             ← 示例 / 真实导出的 K8s YAML
└── web/
    ├── package.json
    ├── src/
    │   ├── App.tsx               UI：左侧 YAML，右侧 React Flow 画布
    │   ├── k8sParser.ts          解析 Ingress / Service / Endpoints
    │   ├── mergeYamlBundles.ts   多文件合并与结构化 merge
    │   ├── buildGraph.ts          构图与初始布局
    │   ├── diagramPersist.ts      画图文件 schema、手写边合并
    │   ├── diagramExportPng.ts    导出 PNG
    │   ├── DiagramActions.tsx     画布右上角：PNG / 保存打开
    │   ├── FlowNodes.tsx          节点样式
    │   └── main.tsx
    └── dist/                 构建产物（勿手改）
```

---

## 常用命令

```bash
cd web
npm install          # 依赖异常时：rm -rf node_modules && npm install
npm run dev          # 本地开发
npm run build        # 生产构建 → web/dist
npm run preview      # 预览构建结果
```

---

## 决策记录（按时间追加）

| 日期 | 决策 | 原因 / 备注 |
|------|------|-------------|
| （示例） | 用 React Flow 而非自绘 Canvas | 交互（缩放、小地图、边标签）现成，专注解析与业务布局。 |
| （示例）| 优先支持标准 `Ingress` + `v1` Service/Endpoints | 与当前 `kubectl` 导出一致；Gateway API 等后续按需扩展。 |

---

## 已知限制与陷阱

- 仅 `Ingress` 的文件：只能画到 **Service 名**，若 YAML 里无 Service/Endpoints，后端细节不会自动出现。
- **同一 namespace** 下的 Service/Endpoints 匹配较稳妥；跨 namespace 引用需后续在解析层显式建模。
- 本地 **`npm install` 失败**：常见为网络超时（重试 / 代理）或对 `node_modules` 内文件的 **EPERM**（沙箱、杀毒、占用）；可删 `node_modules` 重装。

---

## 会话日志（倒序，每次会话末追加几行）

### YYYY-MM-DD

- **做了什么**：
- **未解决**：
- **下一步**：

---

## 模板：新开项目时复制下面一节

```markdown
## 项目：<名称>

- **一句话目标**：
- **用户是谁 / 成功标准**：
- **技术栈**：
- **仓库关键路径**：
- **环境**（Node 版本、是否要 Docker、密钥放哪）：
- **不要做的事**（性能、安全、范围）：
```

---

## 给 AI 的短提示（可复制）

```
请阅读仓库根目录 VIBE_CODING.md 中的「项目速览」「目录与关键文件」「已知限制」。
在修改 web/ 时保持与现有解析与 React Flow 构图方式一致；需要新能力时先改 k8sParser 再改 buildGraph。
```

---

*本文件由人工维护；与实现不一致时，以代码为准，并记得回头改这里。*
