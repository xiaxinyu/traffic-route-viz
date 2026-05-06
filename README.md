# traffic-route-viz

可视化 Kubernetes YAML 中的流量路径：**Ingress → Host → Route → Service → Endpoints**，用于快速理解入口域名/路径如何路由到后端服务与实例。

## Features

- 多文档 YAML 解析（支持 `---` 分隔）
- 多文件导入：点击选择 + 拖拽上传（导入后自动刷新图）
- 图形交互：拖拽分区与节点、缩放/平移、MiniMap、Controls
- 手写连线：从节点手柄拖线添加（灰色虚线，区别于 YAML 自动边）
- 导出 PNG：一键导出画布截图
- 保存/打开画图文件：`*.traffic-viz.json`（含 YAML 上下文 + nodes/edges/viewport）
- 节点展示核心信息：Ingress/Host/Route/Service/Endpoints + TLS/LB IP/Pod IP

## Quickstart

```bash
cd web
npm install
npm run dev
```

在页面左侧粘贴 YAML 或拖拽/选择多个 YAML 文件，图表会自动刷新。

## Tools

- `tools/export-ingress-services.sh`：导出某个 namespace 下的 Ingress 及其关联 Service（按 Ingress 分文件），并打包为 `<namespace>.tar.gz`。

## Project docs

- `HARNESS_ENGINEERING.md`：工程规格与验收标准（单一事实来源）
- `PROJECT_GUIDE.md`：项目运行/协作手册（目录、命令、已知陷阱）
- `AGENTS.md`：多 Agent 切换/交接入口

## Repo layout

- `traffic/`：示例/真实导出的 K8s YAML（本地可忽略提交）
- `tools/`：辅助脚本
- `web/`：前端可视化应用（Vite + React + React Flow）
