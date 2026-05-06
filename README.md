# traffic-route-viz

可视化 Kubernetes YAML 中的流量路径：**Ingress → Host → Service → Endpoints**，用于快速理解入口域名/路径如何路由到后端服务与实例。

## Features

- 多文档 YAML 解析（支持 `---` 分隔）
- 多文件导入：点击选择 + 拖拽上传（导入后自动刷新图）
- 图形交互：拖拽节点、缩放/平移、MiniMap、Controls
- 节点展示核心信息：Ingress/Host/Service/Endpoints + TLS/LB IP/Pod IP

## Quickstart

```bash
cd web
npm install
npm run dev
```

在页面左侧粘贴 YAML 或拖拽/选择多个 YAML 文件，图表会自动刷新。

## Project docs

- `ENGINEERING_REQUIREMENTS.md`：工程规格与验收标准（建议每次改动前先读）
- `VIBE_CODING.md`：Vibe Coding 沉淀与协作方式

## Repo layout

- `traffic/`：示例/真实导出的 K8s YAML
- `web/`：前端可视化应用（Vite + React + React Flow）

# 深圳房地产咨询级文档生成器

本仓库用于将以下附件整理为一份**可付费咨询级**交付物：
- `# 深圳房地产投资课程完整笔记（2026年4月·最终版）.txt`
- `01-中国经济与房地产：从“土地红利”到“新质生产力”的跨越.pdf`
- `01-中国经济与房地产：从“债务驱动”到“生产力驱动”的范式转移_(2026-2030).pdf`
- `02-中国房地产市场展望_(2026-2027).pdf`

## 生成内容
脚本会生成：
- `deliverables/深圳房地产_咨询级整合报告_2026-05.md`（主报告，结构化重排）
- `deliverables/深圳房地产_咨询级整合PPT_2026-05.pptx`（演示版PPT）
- `deliverables/appendix/*.txt`（附件全文抽取，确保“不删内容”）
- `deliverables/manifest.json`（生成清单与路径）

## 运行

安装依赖：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

生成交付物：

```bash
python3 tools/build_consulting_package.py
```

## 重要说明（数据核验与预测）
当前脚本遵循“附件优先”的严格策略：主报告会列出**可核验清单**与**预测假设框架**，但不会凭空生成无法溯源的深圳逐月成交/价格点位数据。若需要“2015-2026逐月序列 + 深圳至2028精细预测”，建议后续接入可追溯的官方/平台原始数据表后再扩展脚本。

