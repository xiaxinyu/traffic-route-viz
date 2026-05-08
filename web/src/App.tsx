import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "reactflow";
import "reactflow/dist/style.css";

import { AuthGate, clearSession } from "./AuthGate";
import { DiagramActions } from "./DiagramActions";
import { buildFlowGraph } from "./buildGraph";
import { edgeTypes } from "./FlowEdges";
import {
  buildGraphMetrics,
  buildGraphPresentation,
  formatClockTime,
  NODE_TYPE_ORDER,
  nodeTypeLabel,
  type NodeTypeFilter,
} from "./graphViewState";
import {
  manualEdgeFromConnection,
  mergeComputedEdgesKeepingManualWithNodeRemap,
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
  IstioGatewayNode,
  RouteNode,
  ServiceNode,
} from "./FlowNodes";
import { getRuntimeConfig } from "./runtimeConfig";

const nodeTypes = {
  ingressRegion: IngressRegionNode,
  ingress: IngressNode,
  istioGateway: IstioGatewayNode,
  destinationRule: DestinationRuleNode,
  host: HostNode,
  httpProxy: HttpProxyNode,
  route: RouteNode,
  service: ServiceNode,
  endpoints: EndpointsNode,
};

const UI_SCALE_STORAGE_KEY = "trv.ui.scale";
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.4;
const UI_SCALE_STEP = 0.1;

const EDGE_LABELS_STORAGE_KEY = "trv.ui.edgeLabels";

function clampUiScale(v: number): number {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(v.toFixed(2))));
}

function readUiScale(): number {
  try {
    const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (!raw) return 1;
    const v = Number(raw);
    if (!Number.isFinite(v)) return 1;
    return clampUiScale(v);
  } catch {
    return 1;
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);
  const { fitView, setCenter } = useReactFlow();

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const p = parseK8sYaml(SAMPLE);
    return buildFlowGraph(p);
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  const graphMetrics = useMemo(() => buildGraphMetrics(nodes, edges), [nodes, edges]);

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

  const applyYaml = useCallback(
    (overrideText?: string, importedFilesOverride?: ImportedYamlFile[] | null) => {
      const src = overrideText ?? yamlText;
      const effectiveFiles = importedFilesOverride ?? importedFiles;
      const p = effectiveFiles?.length
        ? mergeParseResults(effectiveFiles.map((f) => parseK8sYaml(f.text, f.relPath ?? f.name)))
        : parseK8sYaml(src);

      const err = p.errors.length ? p.errors.join("\n") : null;
      setParsedMsg(err);

      const { nodes: n, edges: e } = buildFlowGraph(p);
      setNodes(n);
      setEdges((prevEdges) => mergeComputedEdgesKeepingManualWithNodeRemap(prevEdges, nodes, e, n));
      setLastAppliedAt(Date.now());
    },
    [yamlText, importedFiles, setNodes, setEdges, nodes],
  );

  const mergedImportedText = useMemo(() => {
    return importedFiles ? mergeYamlFiles(importedFiles) : null;
  }, [importedFiles]);

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
          <div className="header-title-wrap">
            <h1>Traffic Route Viz</h1>
            <p>专业化流量拓扑工作台：导入、解析、筛选、定位、导出一体化</p>
          </div>

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
              >
                上一个
              </button>
              <button
                type="button"
                onClick={() => jumpToMatch(matchCursor + 1)}
                disabled={!graphPresentation.matchedNodeIds.length}
              >
                下一个
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
            >
              刷新拓扑
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => fitView({ padding: 0.08, duration: 240 })}
              title="将拓扑重新适配到当前画布"
            >
              适配视图
            </button>

            <div className="search-nav" role="group" aria-label="全局缩放控制">
              <button
                type="button"
                onClick={() => setUiScale((v) => clampUiScale(v - UI_SCALE_STEP))}
                title="全局缩小"
              >
                A-
              </button>
              <button type="button" onClick={() => setUiScale(1)} title="恢复 100%">
                {Math.round(uiScale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setUiScale((v) => clampUiScale(v + UI_SCALE_STEP))}
                title="全局放大"
              >
                A+
              </button>
            </div>

            {getRuntimeConfig().auth?.enabled !== false ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  clearSession();
                  window.location.reload();
                }}
                title="退出登录"
              >
                退出
              </button>
            ) : null}
          </div>

          <div className="header-status-strip" data-testid="top-status-strip">
            <span className="status-pill">节点 {graphMetrics.nodeCount}</span>
            <span className="status-pill">边 {graphMetrics.edgeCount}</span>
            <span className="status-pill">自动边 {graphMetrics.autoEdgeCount}</span>
            <span className="status-pill">手写边 {graphMetrics.manualEdgeCount}</span>
            <span className="status-pill">
              最近刷新 {formatClockTime(lastAppliedAt)}
              {parsedMsg ? "（有告警）" : "（正常）"}
            </span>
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

              <div className="mode-switch">
                <button
                  type="button"
                  className={leftMode === "files" ? "active" : ""}
                  onClick={() => setLeftMode("files")}
                >
                  文件
                </button>
                <button
                  type="button"
                  className={leftMode === "yaml" ? "active" : ""}
                  onClick={() => setLeftMode("yaml")}
                >
                  YAML
                </button>
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
              {...({ webkitdirectory: "", directory: "" } as unknown as Record<string, string>)}
              style={{ display: "none" }}
              onChange={async (ev) => {
                const list = ev.target.files;
                if (!list?.length) return;
                const incoming = await readImportedYamlFiles(list);
                const combined = mergeImportedFiles(importedFiles, incoming);
                setImportedFiles(combined);
                setActiveFileIndex(null);
                setLeftMode("files");
                const merged = mergeYamlFiles(combined);
                setYamlText(merged);
                ev.target.value = "";
                applyYaml(merged, combined);
              }}
            />

            {importedFiles?.length ? (
              <div className="inline-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setActiveFileIndex(null);
                    const merged = mergeYamlFiles(importedFiles);
                    setYamlText(merged);
                    setLeftMode("yaml");
                  }}
                >
                  查看合并 YAML
                </button>
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
                >
                  清空
                </button>
              </div>
            ) : null}
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
              {leftMode === "files" ? "导入文件列表" : "YAML 编辑器"}
            </div>
            {leftMode === "files" ? (
              importedFiles?.length ? (
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
                <div className="empty-box">
                  尚未导入文件。可直接粘贴 YAML，或拖入文件/目录后自动解析。
                </div>
              )
            ) : (
              <>
                <div className="yaml-editor-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setYamlPopoutOpen(true)}
                    data-testid="yaml-popout-open"
                    title="放大查看 YAML（Esc 关闭）"
                  >
                    放大查看
                  </button>
                </div>
                <textarea
                  value={yamlText}
                  data-testid="yaml-textarea"
                  onChange={(e) => {
                    const next = e.target.value;
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
                  }}
                  spellCheck={false}
                  className="yaml-editor"
                />
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
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              requestAnimationFrame(() => instance.fitView({ padding: 0.08 }));
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
                  刷新拓扑
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
              onChange={(e) => {
                const next = e.target.value;
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
              }}
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
