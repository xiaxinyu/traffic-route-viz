import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node as FlowNode,
} from "reactflow";
import "reactflow/dist/style.css";

import { AuthGate, clearSession } from "./AuthGate";
import { DiagramActions } from "./DiagramActions";
import { buildFlowGraph } from "./buildGraph";
import { edgeTypes } from "./FlowEdges";
import {
  applyCanvasSelection,
  buildGraphMetrics,
  buildGraphPresentation,
  buildSelectionMetrics,
  buildYamlTextStats,
  formatClockTime,
  NODE_TYPE_ORDER,
  nodeTypeLabel,
  type NodeTypeFilter,
} from "./graphViewState";
import {
  manualEdgeFromConnection,
  mergeComputedEdgesKeepingManualWithNodeRemap,
  mergeIngressRegionDimensionsFromPrevious,
  reconnectEdgeAsManual,
} from "./diagramPersist";
import {
  mergeParseResults,
  mergeYamlFiles,
  readImportedYamlFiles,
  type ImportedYamlFile,
} from "./mergeYamlBundles";
import { parseK8sYaml } from "./k8sParser";
import {
  DestinationRuleNode,
  EndpointsNode,
  HostNode,
  HttpProxyNode,
  IngressNode,
  IngressRegionNode,
  IstioDestinationNode,
  IstioGatewayNode,
  JunctionNode,
  RouteNode,
  ServiceNode,
} from "./FlowNodes";
import { getRuntimeConfig } from "./runtimeConfig";

const nodeTypes = {
  ingressRegion: IngressRegionNode,
  ingress: IngressNode,
  istioGateway: IstioGatewayNode,
  junction: JunctionNode,
  destinationRule: DestinationRuleNode,
  host: HostNode,
  httpProxy: HttpProxyNode,
  route: RouteNode,
  istioDestination: IstioDestinationNode,
  service: ServiceNode,
  endpoints: EndpointsNode,
};

const UI_SCALE_STORAGE_KEY = "trv.ui.scale";
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.5;
const UI_SCALE_STEP = 0.1;
const UI_SCALE_DEFAULT = 1.08;

const EDGE_LABELS_STORAGE_KEY = "trv.ui.edgeLabels";

function clampUiScale(v: number): number {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(v.toFixed(2))));
}

function readUiScale(): number {
  try {
    const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (!raw) return UI_SCALE_DEFAULT;
    const v = Number(raw);
    if (!Number.isFinite(v)) return UI_SCALE_DEFAULT;
    return clampUiScale(v);
  } catch {
    return UI_SCALE_DEFAULT;
  }
}

function readEdgeLabelsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(EDGE_LABELS_STORAGE_KEY);
    if (raw === null) return true;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

/** Demo: show 2 ingresses + TLS + LB + one endpoints */
const SAMPLE = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rbac-authorization
  namespace: rbac-aswatson-prd
spec:
  ingressClassName: nginx
  rules:
    - host: auth2-api.hk.aswatson.net
      http:
        paths:
          - path: /
            pathType: ImplementationSpecific
            backend:
              service:
                name: rbac-login-frontend
                port:
                  number: 80
          - path: /authorization_code
            pathType: ImplementationSpecific
            backend:
              service:
                name: rbac-authorization
                port:
                  number: 8080
          - path: /api
            pathType: ImplementationSpecific
            backend:
              service:
                name: envoy-rbac-gateway-gtw
                port:
                  number: 30001
status:
  loadBalancer:
    ingress:
      - ip: 10.24.205.230
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rbac-global-ingress
  namespace: ingress-nginx
spec:
  ingressClassName: nginx
  rules:
    - host: auth2-api.hk.aswatson.net
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: rbac-global-service
                port:
                  number: 80
    - host: api.apac.aswatson.net
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: rbac-global-service
                port:
                  number: 80
  tls:
    - hosts:
        - auth2-api.hk.aswatson.net
      secretName: auth2-api.hk.aswatson.net.20260119
status:
  loadBalancer:
    ingress:
      - ip: 10.32.57.30
---
apiVersion: v1
kind: Service
metadata:
  name: rbac-global-service
  namespace: ingress-nginx
spec:
  type: ClusterIP
  clusterIP: None
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: Endpoints
metadata:
  name: rbac-global-service
  namespace: ingress-nginx
subsets:
  - addresses:
      - ip: 10.32.56.252
    ports:
      - port: 80
        protocol: TCP
`;

function AppInner() {
  const [yamlText, setYamlText] = useState(SAMPLE);
  const [parsedMsg, setParsedMsg] = useState<string | null>(null);
  const [importedFiles, setImportedFiles] = useState<ImportedYamlFile[] | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const [leftMode, setLeftMode] = useState<"files" | "yaml">("files");
  const [yamlPopoutOpen, setYamlPopoutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<NodeTypeFilter>("all");
  const [matchCursor, setMatchCursor] = useState(0);
  const [lastAppliedAt, setLastAppliedAt] = useState(() => Date.now());
  const [uiScale, setUiScale] = useState<number>(() => readUiScale());
  const [edgeLabelsEnabled, setEdgeLabelsEnabled] = useState<boolean>(() =>
    readEdgeLabelsEnabled(),
  );
  const [statusOpen, setStatusOpen] = useState(false);

  const Icon = ({ d }: { d: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="trv-icon">
      <path d={d} fill="currentColor" />
    </svg>
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);
  const { fitView, setCenter } = useReactFlow();

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const p = parseK8sYaml(SAMPLE);
    return buildFlowGraph(p);
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  const graphMetrics = useMemo(() => buildGraphMetrics(nodes, edges), [nodes, edges]);
  const selectionMetrics = useMemo(() => buildSelectionMetrics(nodes, edges), [nodes, edges]);
  const yamlTextStats = useMemo(() => buildYamlTextStats(yamlText), [yamlText]);

  const graphPresentation = useMemo(
    () =>
      buildGraphPresentation(nodes, edges, {
        query: searchQuery,
        typeFilter,
      }),
    [nodes, edges, searchQuery, typeFilter],
  );

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) => {
        if (!c.source || !c.target) return eds;
        const sameManualExists = eds.some(
          (e) =>
            e.data?.manual === true &&
            e.source === c.source &&
            e.target === c.target &&
            (e.sourceHandle ?? null) === (c.sourceHandle ?? null) &&
            (e.targetHandle ?? null) === (c.targetHandle ?? null),
        );
        if (sameManualExists) return eds;
        return [...eds, manualEdgeFromConnection(c)];
      }),
    [setEdges],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, c: Connection) => setEdges((eds) => reconnectEdgeAsManual(oldEdge, c, eds)),
    [setEdges],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const isAdditiveSelection = useCallback(
    (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
      e.shiftKey || e.metaKey || e.ctrlKey,
    [],
  );

  const onNodeClick = useCallback(
    (e: ReactMouseEvent, node: FlowNode) => {
      const additive = isAdditiveSelection(e);
      setNodes((prev) => applyCanvasSelection(prev, node.id, additive));
      if (!additive) setEdges((prev) => applyCanvasSelection(prev, null, false));
    },
    [isAdditiveSelection, setEdges, setNodes],
  );

  const onEdgeClick = useCallback(
    (e: ReactMouseEvent, edge: Edge) => {
      const additive = isAdditiveSelection(e);
      setEdges((prev) => applyCanvasSelection(prev, edge.id, additive));
      if (!additive) setNodes((prev) => applyCanvasSelection(prev, null, false));
    },
    [isAdditiveSelection, setEdges, setNodes],
  );

  const onCanvasMouseDownCapture = useCallback(
    (e: ReactMouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const nodeEl = target.closest<HTMLElement>(".react-flow__node[data-id]");
      if (nodeEl) {
        const additive = isAdditiveSelection(e);
        const nodeId = nodeEl.dataset.id ?? null;
        window.setTimeout(() => {
          setNodes((prev) => applyCanvasSelection(prev, nodeId, additive));
          if (!additive) setEdges((prev) => applyCanvasSelection(prev, null, false));
        }, 0);
        return;
      }

      const edgeEl = target.closest<HTMLElement>(".react-flow__edge[data-id]");
      if (edgeEl) {
        const additive = isAdditiveSelection(e);
        const edgeId = edgeEl.dataset.id ?? null;
        window.setTimeout(() => {
          setEdges((prev) => applyCanvasSelection(prev, edgeId, additive));
          if (!additive) setNodes((prev) => applyCanvasSelection(prev, null, false));
        }, 0);
      }
    },
    [isAdditiveSelection, setEdges, setNodes],
  );

  const updateYamlText = useCallback(
    (next: string) => {
      setYamlText(next);
      if (importedFiles && activeFileIndex !== null) {
        setImportedFiles((prev) => {
          if (!prev) return prev;
          if (activeFileIndex < 0 || activeFileIndex >= prev.length) return prev;
          const copy = [...prev];
          const current = copy[activeFileIndex];
          if (!current) return prev;
          copy[activeFileIndex] = { ...current, text: next };
          return copy;
        });
      }
    },
    [activeFileIndex, importedFiles],
  );

  const applyYaml = useCallback(
    (overrideText?: string, importedFilesOverride?: ImportedYamlFile[] | null) => {
      const src = overrideText ?? yamlText;
      const effectiveFiles = importedFilesOverride ?? importedFiles;
      const p = effectiveFiles?.length
        ? mergeParseResults(effectiveFiles.map((f) => parseK8sYaml(f.text, f.relPath ?? f.name)))
        : parseK8sYaml(src);

      const err = p.errors.length ? p.errors.join("\n") : null;
      setParsedMsg(err);

      const { nodes: computedNodes, edges: e } = buildFlowGraph(p);
      const mergedNodes = mergeIngressRegionDimensionsFromPrevious(nodes, computedNodes);
      setNodes(mergedNodes);
      setEdges((prevEdges) =>
        mergeComputedEdgesKeepingManualWithNodeRemap(prevEdges, nodes, e, mergedNodes),
      );
      setLastAppliedAt(Date.now());
    },
    [yamlText, importedFiles, setNodes, setEdges, nodes],
  );

  const handleImportFileList = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      const incoming = await readImportedYamlFiles(list);
      const combined = mergeImportedFiles(importedFiles, incoming);
      setImportedFiles(combined);
      setActiveFileIndex(null);
      setLeftMode("files");
      const merged = mergeYamlFiles(combined);
      setYamlText(merged);
      applyYaml(merged, combined);
    },
    [applyYaml, importedFiles],
  );

  const mergedImportedText = useMemo(() => {
    return importedFiles ? mergeYamlFiles(importedFiles) : null;
  }, [importedFiles]);

  const switchLeftMode = useCallback(
    (next: "files" | "yaml") => {
      setLeftMode(next);
      if (next !== "yaml") return;
      if (!importedFiles?.length) return;
      if (activeFileIndex !== null) {
        const f = importedFiles[activeFileIndex];
        if (f) setYamlText(f.text);
        return;
      }
      setYamlText(mergeYamlFiles(importedFiles));
    },
    [activeFileIndex, importedFiles],
  );

  const displayPath = useCallback((f: ImportedYamlFile) => f.relPath ?? f.name, []);

  const displayFolderHint = useCallback((p: string) => {
    return p
      .split("/")
      .filter(Boolean)
      .slice(0, -1)
      .map((seg) => seg.replace(/^(0[1-3])[-_]/, ""))
      .join(" / ");
  }, []);

  const focusNodeById = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      const pos = n.positionAbsolute ?? n.position;
      const w = n.width ?? 220;
      const h = n.height ?? 80;
      setCenter(pos.x + w / 2, pos.y + h / 2, { zoom: 1.06, duration: 260 });
    },
    [nodes, setCenter],
  );

  const focusRegionByImportedFile = useCallback(
    (f: ImportedYamlFile) => {
      const candidates = [f.relPath, f.name].filter(Boolean).map((x) => String(x).toLowerCase());
      if (!candidates.length) return;
      const hit = nodes.find((n) => {
        if (n.type !== "ingressRegion") return false;
        const src = (n.data as any)?.sourceFiles as string[] | undefined;
        if (!Array.isArray(src) || !src.length) return false;
        return src.some((s) => {
          const ss = String(s).toLowerCase();
          return candidates.some((c) => ss === c || ss.endsWith(`/${c}`) || c.endsWith(`/${ss}`));
        });
      });
      if (!hit) return;
      setNodes((prev) => applyCanvasSelection(prev, hit.id, false));
      focusNodeById(hit.id);
    },
    [focusNodeById, nodes, setNodes],
  );

  const jumpToMatch = useCallback(
    (nextCursor: number) => {
      const total = graphPresentation.matchedNodeIds.length;
      if (!total) return;
      const normalized = ((nextCursor % total) + total) % total;
      setMatchCursor(normalized);
      const nodeId = graphPresentation.matchedNodeIds[normalized];
      if (nodeId) focusNodeById(nodeId);
    },
    [graphPresentation.matchedNodeIds, focusNodeById],
  );

  useEffect(() => {
    setMatchCursor(0);
  }, [searchQuery, typeFilter]);

  useEffect(() => {
    if (!yamlPopoutOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setYamlPopoutOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [yamlPopoutOpen]);

  useEffect(() => {
    const next = clampUiScale(uiScale);
    document.documentElement.style.setProperty("--ui-scale", String(next));
    try {
      localStorage.setItem(UI_SCALE_STORAGE_KEY, String(next));
    } catch {
      // ignore persistence failures
    }
  }, [uiScale]);

  useEffect(() => {
    try {
      localStorage.setItem(EDGE_LABELS_STORAGE_KEY, String(edgeLabelsEnabled));
    } catch {
      // ignore persistence failures
    }
  }, [edgeLabelsEnabled]);

  const presentedEdges = useMemo(() => {
    if (edgeLabelsEnabled) return graphPresentation.edges;
    return graphPresentation.edges.map((e) => (e.label ? { ...e, label: undefined } : e));
  }, [graphPresentation.edges, edgeLabelsEnabled]);

  const readDroppedFiles = useCallback(async (dt: DataTransfer): Promise<ImportedYamlFile[]> => {
    const items = Array.from(dt.items ?? []);
    const hasEntryApi = items.some((it) => typeof (it as any).webkitGetAsEntry === "function");
    if (!hasEntryApi) {
      return await readImportedYamlFiles(dt.files);
    }

    type Entry = {
      isFile: boolean;
      isDirectory: boolean;
      fullPath?: string;
      name: string;
      file?: (cb: (f: File) => void) => void;
      createReader?: () => { readEntries: (cb: (entries: Entry[]) => void) => void };
    };

    const out: ImportedYamlFile[] = [];
    const visit = async (entry: Entry): Promise<void> => {
      if (entry.isFile && entry.file) {
        const file = await new Promise<File>((resolve) => entry.file?.(resolve));
        const name = file.name;
        const relPath =
          typeof entry.fullPath === "string"
            ? entry.fullPath.replace(/^\//, "")
            : (file as any).webkitRelativePath || undefined;
        if (!/\.(ya?ml)$/i.test(name)) return;
        out.push({ name, relPath, text: await file.text() });
        return;
      }

      if (entry.isDirectory && entry.createReader) {
        const reader = entry.createReader();
        const readAll = async (): Promise<void> => {
          const batch = await new Promise<Entry[]>((resolve) => reader.readEntries(resolve));
          if (!batch.length) return;
          for (const child of batch) await visit(child);
          await readAll();
        };
        await readAll();
      }
    };

    for (const it of items) {
      const e = (it as any).webkitGetAsEntry?.() as Entry | undefined;
      if (e) await visit(e);
    }
    return out;
  }, []);

  const mergeImportedFiles = useCallback(
    (prev: ImportedYamlFile[] | null, next: ImportedYamlFile[]): ImportedYamlFile[] => {
      const keyOf = (f: ImportedYamlFile) => f.relPath ?? f.name;
      const m = new Map<string, ImportedYamlFile>();
      for (const f of prev ?? []) m.set(keyOf(f), f);
      for (const f of next) m.set(keyOf(f), f);
      return [...m.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    },
    [],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-main">
          <div className="header-left">
            <div className="header-title-wrap">
              <h1>Traffic Route Viz</h1>
              <p>专业化流量拓扑工作台：导入、解析、筛选、定位、导出一体化</p>
            </div>
          </div>

          <div className="header-right">
            <div className="header-main-controls">
              <input
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") jumpToMatch(matchCursor + 1);
                }}
                placeholder="搜索节点（name / host / path / service）"
                aria-label="搜索节点"
              />

              <div className="search-nav">
                <button
                  type="button"
                  onClick={() => jumpToMatch(matchCursor - 1)}
                  disabled={!graphPresentation.matchedNodeIds.length}
                  aria-label="上一个"
                  title="上一个"
                >
                  <Icon d="M15 6l-6 6 6 6" />
                </button>
                <button
                  type="button"
                  onClick={() => jumpToMatch(matchCursor + 1)}
                  disabled={!graphPresentation.matchedNodeIds.length}
                  aria-label="下一个"
                  title="下一个"
                >
                  <Icon d="M9 6l6 6-6 6" />
                </button>
                <span>
                  {graphPresentation.matchedNodeIds.length
                    ? `${matchCursor + 1}/${graphPresentation.matchedNodeIds.length}`
                    : "0/0"}
                </span>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={() => applyYaml(mergedImportedText ?? yamlText)}
                title="重新解析 YAML 并刷新拓扑"
                aria-label="刷新"
              >
                <Icon d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 12.65-5.65z" />
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => fitView({ padding: 0.05, duration: 240 })}
                title="将拓扑重新适配到当前画布"
                aria-label="适配"
              >
                <Icon d="M4 7V4h3v2H6v1H4zm14-1V4h3v3h-2V6h-1zm1 15h2v-3h-2v1h-1v2h1zm-15 0v-3h2v1h1v2H4z" />
              </button>

              <div className="search-nav" role="group" aria-label="全局缩放控制">
                <button
                  type="button"
                  onClick={() => setUiScale((v) => clampUiScale(v - UI_SCALE_STEP))}
                  title="缩小侧栏与拓扑（含文字）"
                  aria-label="缩小"
                >
                  <Icon d="M19 13H5v-2h14v2z" />
                </button>
                <button
                  type="button"
                  onClick={() => setUiScale(1)}
                  title="将侧栏与拓扑缩放设为 100%"
                  aria-label="重置缩放"
                >
                  <span className="trv-icon-btn-text">{Math.round(uiScale * 100)}%</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUiScale((v) => clampUiScale(v + UI_SCALE_STEP))}
                  title="放大侧栏与拓扑（含文字）"
                  aria-label="放大"
                >
                  <Icon d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </button>
              </div>

              <button
                type="button"
                className={statusOpen ? "btn-secondary btn-pill-active" : "btn-secondary"}
                onClick={() => setStatusOpen((v) => !v)}
                title={statusOpen ? "收起指标" : "展开指标"}
                aria-label="指标"
              >
                <Icon d="M5 9h3v10H5V9zm5-4h3v14h-3V5zm5 7h3v7h-3v-7z" />
              </button>

              {getRuntimeConfig().auth?.enabled !== false ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    clearSession();
                    window.location.reload();
                  }}
                  title="退出登录"
                  aria-label="退出"
                >
                  <Icon d="M10 17l1.41-1.41L9.83 14H20v-2H9.83l1.58-1.59L10 9l-5 5 5 3zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z" />
                </button>
              ) : null}
            </div>

            {statusOpen ? (
              <div
                className="header-status-strip header-status-strip-compact"
                data-testid="top-status-strip"
              >
                <span className="status-pill">节点 {graphMetrics.nodeCount}</span>
                <span className="status-pill">边 {graphMetrics.edgeCount}</span>
                <span className="status-pill">自动 {graphMetrics.autoEdgeCount}</span>
                <span className="status-pill">手写 {graphMetrics.manualEdgeCount}</span>
                <span className="status-pill">
                  已选 {selectionMetrics.selectedNodeCount}/{selectionMetrics.selectedEdgeCount}
                </span>
                <span className="status-pill">
                  刷新 {formatClockTime(lastAppliedAt)}
                  {parsedMsg ? "（告警）" : "（正常）"}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {parsedMsg ? (
        <div className="parse-warning" data-testid="parse-warning">
          <strong>解析告警：</strong>
          <pre>{parsedMsg}</pre>
        </div>
      ) : null}

      <div className="main-body">
        <aside className="left-panel">
          <section className="left-panel-block">
            <div className="block-title-row">
              <div>
                <div className="block-title">输入与数据源</div>
                <div className="block-subtitle">
                  {importedFiles?.length
                    ? `已导入 ${importedFiles.length} 个文件（默认合并解析）`
                    : "可粘贴 YAML，或导入多文件/文件夹进行合并解析"}
                </div>
              </div>
            </div>

            <div
              data-testid="import-dropzone"
              className="import-dropzone"
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={async (ev) => {
                ev.preventDefault();
                const incoming = await readDroppedFiles(ev.dataTransfer);
                if (!incoming?.length) return;
                const combined = mergeImportedFiles(importedFiles, incoming);
                setImportedFiles(combined);
                setActiveFileIndex(null);
                setLeftMode("files");
                const merged = mergeYamlFiles(combined);
                setYamlText(merged);
                applyYaml(merged, combined);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <div className="dropzone-title">导入 YAML 文件 / 文件夹</div>
              <div className="dropzone-desc">支持多文件夹追加导入与去重；导入后自动解析刷新。</div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml,.YAML,.YML,text/plain,text/yaml"
              multiple
              style={{ display: "none" }}
              onChange={async (ev) => {
                await handleImportFileList(ev.target.files);
                ev.target.value = "";
              }}
            />

            <input
              ref={folderInputRef}
              type="file"
              accept=".yaml,.yml,.YAML,.YML,text/plain,text/yaml"
              multiple
              {...({ webkitdirectory: "", directory: "" } as unknown as Record<string, string>)}
              style={{ display: "none" }}
              onChange={async (ev) => {
                await handleImportFileList(ev.target.files);
                ev.target.value = "";
              }}
            />

            <div className="inline-actions" role="group" aria-label="导入按钮">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                title="导入一个或多个 YAML 文件"
                aria-label="导入文件"
              >
                <Icon d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6zm1 7V3.5L18.5 9H15z" />
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => folderInputRef.current?.click()}
                title="导入文件夹（保留相对路径）"
                aria-label="导入文件夹"
              >
                <Icon d="M10 4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6z" />
              </button>
              {importedFiles?.length ? (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    setImportedFiles(null);
                    setActiveFileIndex(null);
                    setYamlText(SAMPLE);
                    setParsedMsg(null);
                    setLeftMode("yaml");
                    applyYaml(SAMPLE, null);
                  }}
                  aria-label="清空"
                  title="清空"
                >
                  <Icon d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                </button>
              ) : null}
            </div>
          </section>

          <section className="left-panel-block compact">
            <div className="block-title-row">
              <div>
                <div className="block-title">图谱聚焦</div>
                <div className="block-subtitle">先选类型，再用顶部搜索和上下一个跳转</div>
              </div>
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setTypeFilter("all");
                  setSearchQuery("");
                }}
                title="清空类型筛选与搜索关键字"
              >
                清空
              </button>
            </div>

            <div className="focus-controls">
              <label className="focus-select-wrap" htmlFor="node-type-filter">
                节点类型
                <select
                  id="node-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as NodeTypeFilter)}
                >
                  {NODE_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {nodeTypeLabel(t)}（{graphMetrics.typeCounts[t]}）
                    </option>
                  ))}
                </select>
              </label>
              <div className="focus-hint">
                当前筛选：{nodeTypeLabel(typeFilter)}，匹配{" "}
                {graphPresentation.matchedNodeIds.length} 个节点
              </div>
            </div>
          </section>

          <section className="left-panel-block grow">
            <div className="panel-list-title">
              <span>{leftMode === "files" ? "文件" : "YAML"}</span>
              <div className="mode-switch" aria-label="文件与 YAML 切换">
                <button
                  type="button"
                  className={leftMode === "files" ? "active" : ""}
                  onClick={() => switchLeftMode("files")}
                >
                  文件
                </button>
                <button
                  type="button"
                  className={leftMode === "yaml" ? "active" : ""}
                  onClick={() => switchLeftMode("yaml")}
                >
                  YAML
                </button>
              </div>
            </div>
            {leftMode === "files" ? (
              <>
                {importedFiles?.length ? (
                  <div className="file-list">
                    {importedFiles.map((f, idx) => {
                      const active = activeFileIndex === idx;
                      const p = displayPath(f);
                      const folderHint = f.relPath ? displayFolderHint(f.relPath) : "";
                      return (
                        <div
                          key={p + idx}
                          onClick={() => {
                            setActiveFileIndex(idx);
                            focusRegionByImportedFile(f);
                          }}
                          onDoubleClick={() => {
                            setActiveFileIndex(idx);
                            setYamlText(f.text);
                            setLeftMode("yaml");
                          }}
                          role="button"
                          tabIndex={0}
                          title={p}
                          className={active ? "file-item active" : "file-item"}
                        >
                          <div className="file-item-title">{f.name}</div>
                          {folderHint ? <div className="file-item-hint">{folderHint}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-box">尚未导入。可拖入文件/目录，或点击上方“导文/导夹”。</div>
                )}
              </>
            ) : (
              <>
                <div className="yaml-editor-actions">
                  <div className="yaml-editor-stats" data-testid="yaml-editor-stats">
                    {yamlTextStats.lineCount} 行 · {yamlTextStats.documentCount} 文档 ·{" "}
                    {yamlTextStats.characterCount} 字符
                  </div>
                  <div className="yaml-editor-action-buttons">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => applyYaml(yamlText, importedFiles)}
                      data-testid="yaml-inline-refresh"
                      disabled={!yamlTextStats.hasContent}
                      title="解析当前 YAML 并刷新拓扑"
                    >
                      解析
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => updateYamlText("")}
                      data-testid="yaml-clear"
                      disabled={!yamlTextStats.hasContent}
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setImportedFiles(null);
                        setActiveFileIndex(null);
                        updateYamlText(SAMPLE);
                        setParsedMsg(null);
                        setLeftMode("yaml");
                        applyYaml(SAMPLE, null);
                      }}
                      data-testid="yaml-restore-sample"
                    >
                      示例
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setYamlPopoutOpen(true)}
                      data-testid="yaml-popout-open"
                      title="放大查看 YAML（Esc 关闭）"
                    >
                      放大
                    </button>
                  </div>
                </div>
                <div className="yaml-editor-shell">
                  <div className="yaml-gutter" aria-hidden="true">
                    {Array.from(
                      { length: Math.min(Math.max(yamlTextStats.lineCount, 1), 999) },
                      (_, i) => (
                        <span key={i + 1}>{i + 1}</span>
                      ),
                    )}
                  </div>
                  <textarea
                    value={yamlText}
                    data-testid="yaml-textarea"
                    onChange={(e) => updateYamlText(e.target.value)}
                    spellCheck={false}
                    className="yaml-editor"
                  />
                </div>
              </>
            )}
          </section>
        </aside>

        <div ref={flowContainerRef} className="flow-stage">
          <ReactFlow
            data-testid="react-flow"
            nodes={graphPresentation.nodes}
            edges={presentedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onMouseDownCapture={onCanvasMouseDownCapture}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              requestAnimationFrame(() => instance.fitView({ padding: 0.05 }));
            }}
            minZoom={0.2}
            maxZoom={1.8}
            nodesDraggable={true}
            nodesConnectable={true}
            edgesUpdatable={true}
            elementsSelectable={true}
            deleteKeyCode={["Backspace", "Delete"]}
            reconnectRadius={18}
            edgeUpdaterRadius={18}
            defaultEdgeOptions={{ interactionWidth: 36 }}
            connectionMode={ConnectionMode.Loose}
            connectionLineStyle={{ stroke: "#334155", strokeWidth: 1.7 }}
          >
            <Background gap={14} color="rgba(15,23,42,0.08)" />
            <Controls />
            <MiniMap nodeStrokeWidth={2} maskColor="rgba(15,23,42,0.08)" />
            <DiagramActions
              yamlText={yamlText}
              setYamlText={setYamlText}
              importedFiles={importedFiles}
              setImportedFiles={setImportedFiles}
              activeFileIndex={activeFileIndex}
              setActiveFileIndex={setActiveFileIndex}
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              setParsedMsg={setParsedMsg}
              flowContainerRef={flowContainerRef}
              edgeLabelsEnabled={edgeLabelsEnabled}
              setEdgeLabelsEnabled={setEdgeLabelsEnabled}
            />
          </ReactFlow>
        </div>
      </div>

      {yamlPopoutOpen ? (
        <div
          className="trv-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="YAML 放大查看"
          data-testid="yaml-popout"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setYamlPopoutOpen(false);
          }}
        >
          <div className="trv-modal">
            <div className="trv-modal-header">
              <div className="trv-modal-title">YAML 编辑器（放大查看）</div>
              <div className="trv-modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => applyYaml(yamlText, importedFiles)}
                  data-testid="yaml-popout-refresh"
                  title="重新解析 YAML 并刷新拓扑"
                >
                  刷新
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setYamlPopoutOpen(false)}
                  data-testid="yaml-popout-close"
                  title="关闭（Esc）"
                >
                  关闭
                </button>
              </div>
            </div>

            <textarea
              autoFocus
              value={yamlText}
              onChange={(e) => updateYamlText(e.target.value)}
              spellCheck={false}
              className="yaml-editor yaml-editor-popout"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AuthGate>
        <AppInner />
      </AuthGate>
    </ReactFlowProvider>
  );
}
