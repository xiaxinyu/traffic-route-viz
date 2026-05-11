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

import { clearSession } from "../features/auth/AuthGate";
import { DiagramActions } from "../features/diagram/DiagramActions";
import { edgeTypes } from "../features/diagram/FlowEdges";
import { buildFlowGraph } from "../domain/buildGraph";
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
} from "../domain/graphViewState";
import {
  manualEdgeFromConnection,
  mergeComputedEdgesKeepingManualWithNodeRemap,
  mergeIngressRegionDimensionsFromPrevious,
  reconnectEdgeAsManual,
} from "../domain/diagramPersist";
import {
  mergeParseResults,
  mergeYamlFiles,
  readImportedYamlFiles,
  type ImportedYamlFile,
} from "../domain/mergeYamlBundles";
import { parseK8sYaml } from "../domain/k8sParser";
import { RouteMergeAiModal } from "../features/route-merge/RouteMergeAiModal";
import { RouteMergeHelpTrigger } from "../features/route-merge/RouteMergeHelpTrigger";
import {
  resolveRouteMergeAiConfig,
  routeMergeAiDisabledReason,
} from "../features/route-merge/routeMergeAiConfig";
import { useRouteMergeAi } from "../features/route-merge/useRouteMergeAi";
import { useRouteMergeAnalysis } from "../features/route-merge/useRouteMergeAnalysis";
import { stripK8sMetadataNoise, summarizeImportedYamlLines } from "../domain/yamlLineStats";
import { getRuntimeConfig } from "../domain/runtimeConfig";
import { flowNodeTypes } from "./nodeTypes";
import { AppHeader } from "./AppHeader";
import { SAMPLE_YAML } from "./sampleYaml";
import { TRV_ICONS } from "./trvIcons";
import {
  clampUiScale,
  EDGE_LABELS_STORAGE_KEY,
  readEdgeLabelsEnabled,
  readUiScale,
  UI_SCALE_STEP,
  UI_SCALE_STORAGE_KEY,
} from "./uiPreferences";

export function AppInner() {
  const [yamlText, setYamlText] = useState(SAMPLE_YAML);
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

  const canRouteMergeAi = Boolean(resolveRouteMergeAiConfig());
  const routeMergeAiHint = canRouteMergeAi ? null : routeMergeAiDisabledReason();
  const routeMergeAi = useRouteMergeAi(yamlText, importedFiles);
  const routeMergeAnalysis = useRouteMergeAnalysis(yamlText, importedFiles);

  const Icon = ({ d, className }: { d: string; className?: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? "trv-icon"}>
      <path d={d} fill="currentColor" />
    </svg>
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);
  const { fitView, setCenter } = useReactFlow();

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const p = parseK8sYaml(SAMPLE_YAML);
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
      const srcRaw = overrideText ?? yamlText;
      const src = stripK8sMetadataNoise(srcRaw);
      const effectiveFilesRaw = importedFilesOverride ?? importedFiles;
      const effectiveFiles = effectiveFilesRaw?.length
        ? effectiveFilesRaw.map((f) => ({ ...f, text: stripK8sMetadataNoise(f.text) }))
        : null;

      if (src !== srcRaw) {
        updateYamlText(src);
      }
      if (effectiveFilesRaw?.length) {
        const changed = effectiveFiles!.some((f, i) => f.text !== effectiveFilesRaw[i]!.text);
        if (changed) setImportedFiles(effectiveFiles);
      }

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
      const incomingRaw = await readImportedYamlFiles(list);
      const incoming = incomingRaw.map((f) => ({ ...f, text: stripK8sMetadataNoise(f.text) }));
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

  const importedLinesSummary = useMemo(() => {
    if (!importedFiles?.length) return null;
    return summarizeImportedYamlLines(importedFiles);
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

      <AppHeader
        Icon={Icon}
        icons={{
          docFile: TRV_ICONS.docFile,
          folder: TRV_ICONS.folder,
          trash: TRV_ICONS.trash,
          chevLeft: TRV_ICONS.chevLeft,
          chevRight: TRV_ICONS.chevRight,
          refresh: TRV_ICONS.refresh,
          fit: TRV_ICONS.fit,
          minus: TRV_ICONS.minus,
          plus: TRV_ICONS.plus,
          chart: TRV_ICONS.chart,
          logout: TRV_ICONS.logout,
        }}
        importedFiles={importedFiles}
        importedLinesSummary={importedLinesSummary}
        yamlTextStats={yamlTextStats}
        onClickImportFiles={() => fileInputRef.current?.click()}
        onClickImportFolder={() => folderInputRef.current?.click()}
        onClearImported={() => {
          setImportedFiles(null);
          setActiveFileIndex(null);
          setYamlText(SAMPLE_YAML);
          setParsedMsg(null);
          setLeftMode("yaml");
          applyYaml(SAMPLE_YAML, null);
        }}
        onDropImport={async (dt) => {
          const incoming = await readDroppedFiles(dt);
          if (!incoming?.length) return;
          const combined = mergeImportedFiles(importedFiles, incoming);
          setImportedFiles(combined);
          setActiveFileIndex(null);
          setLeftMode("files");
          const merged = mergeYamlFiles(combined);
          setYamlText(merged);
          applyYaml(merged, combined);
        }}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        matchLabel={
          graphPresentation.matchedNodeIds.length
            ? `${matchCursor + 1}/${graphPresentation.matchedNodeIds.length}`
            : "0/0"
        }
        onPrevMatch={() => jumpToMatch(matchCursor - 1)}
        onNextMatch={() => jumpToMatch(matchCursor + 1)}
        hasMatches={Boolean(graphPresentation.matchedNodeIds.length)}
        onRefresh={() => applyYaml(mergedImportedText ?? yamlText)}
        onFit={() => fitView({ padding: 0.05, duration: 240 })}
        uiScalePct={Math.round(uiScale * 100)}
        onZoomOut={() => setUiScale((v) => clampUiScale(v - UI_SCALE_STEP))}
        onZoomReset={() => setUiScale(1)}
        onZoomIn={() => setUiScale((v) => clampUiScale(v + UI_SCALE_STEP))}
        statusOpen={statusOpen}
        toggleStatusOpen={() => setStatusOpen((v) => !v)}
        canLogout={getRuntimeConfig().auth?.enabled !== false}
        onLogout={() => {
          clearSession();
          window.location.reload();
        }}
        statusStrip={
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
        }
      />

      {parsedMsg ? (
        <div className="parse-warning" data-testid="parse-warning">
          <strong>解析告警：</strong>
          <pre>{parsedMsg}</pre>
        </div>
      ) : null}

      <div className="main-body">
        <aside className="left-panel">
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
              <div className="panel-list-title-start">
                <span className="panel-list-heading">
                  <span className="panel-list-heading-icon" aria-hidden>
                    <Icon
                      d={leftMode === "files" ? TRV_ICONS.docFile : TRV_ICONS.yamlLines}
                      className="trv-icon trv-icon--sm"
                    />
                  </span>
                  {leftMode === "files" ? "数据源" : "YAML 编辑器"}
                </span>
                {leftMode === "files" && importedFiles && importedFiles.length > 1 ? (
                  <button
                    type="button"
                    className={`btn-ai panel-list-ai-all${routeMergeAi.busy ? " btn-ai--busy" : ""}`}
                    disabled={!canRouteMergeAi || routeMergeAi.busy}
                    title={routeMergeAiHint ?? "基于所有已导入文件合并上下文请求 AI"}
                    onClick={() => void routeMergeAi.runAll()}
                  >
                    <Icon d={TRV_ICONS.aiStar} className="trv-icon trv-icon--sm" />
                    <span>全部</span>
                  </button>
                ) : null}
              </div>
              <div className="mode-switch" role="group" aria-label="文件与 YAML 切换">
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
              importedFiles?.length ? (
                <div className="file-list">
                  {importedFiles.map((f, idx) => {
                    const active = activeFileIndex === idx;
                    const p = displayPath(f);
                    const folderHint = f.relPath ? displayFolderHint(f.relPath) : "";
                    const lineCount = importedLinesSummary?.perFile[idx]?.lineCount ?? 0;
                    const showPerFileAi = importedFiles.length >= 1;
                    return (
                      <div
                        key={p + idx}
                        title={p}
                        className={active ? "file-item active" : "file-item"}
                      >
                        <div className="file-item-inner">
                          <div
                            role="button"
                            tabIndex={0}
                            className="file-item-main-hit"
                            onClick={() => {
                              setActiveFileIndex(idx);
                              focusRegionByImportedFile(f);
                            }}
                            onDoubleClick={() => {
                              setActiveFileIndex(idx);
                              setYamlText(f.text);
                              setLeftMode("yaml");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setActiveFileIndex(idx);
                                focusRegionByImportedFile(f);
                              }
                            }}
                          >
                            <div className="file-item-doc-row">
                              <span className="file-item-type-icon" aria-hidden>
                                <Icon d={TRV_ICONS.docFile} className="trv-icon trv-icon--md" />
                              </span>
                              <div className="file-item-main">
                                <div className="file-item-title">{f.name}</div>
                                {folderHint ? (
                                  <div className="file-item-hint">{folderHint}</div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="file-item-trailing">
                            {showPerFileAi ? (
                              <div className="file-item-ai-row">
                                <button
                                  type="button"
                                  className={`btn-ai file-item-ai-btn${routeMergeAi.busy ? " btn-ai--busy" : ""}`}
                                  disabled={!canRouteMergeAi || routeMergeAi.busy}
                                  title={
                                    routeMergeAiHint ??
                                    "仅将本文件中的 Ingress / VirtualService / DestinationRule 与对应规则摘要发给模型"
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void routeMergeAi.runForImportedFileIndex(idx);
                                  }}
                                >
                                  <Icon d={TRV_ICONS.aiStar} className="trv-icon trv-icon--sm" />
                                  <span>AI</span>
                                </button>
                                <RouteMergeHelpTrigger analysis={routeMergeAnalysis} />
                              </div>
                            ) : null}
                            <span className="file-item-lines" title="该文件 text 行数（含空行）">
                              {lineCount} 行
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {importedLinesSummary && importedFiles.length > 1 ? (
                    <div
                      className="import-line-stats-note"
                      data-testid="import-line-stats-note"
                      title="合并文本由 mergeYamlFiles 以换行 + --- + 换行连接；与各文件行数之和可能因分隔行与首尾换行而不相等。"
                    >
                      行数口径：各文件行数相加 vs 合并拼接（
                      <code className="import-line-stats-code">---</code>
                      ）后行数可能不同；与左侧 YAML 编辑区行数统计一致（
                      <code className="import-line-stats-code">\n</code>
                      分段，含空行）。
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="empty-box">
                  尚未导入。请在顶部「输入与数据源」上传文件、上传文件夹，或直接拖拽 YAML
                  到顶部导入区。
                </div>
              )
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
                      className="btn-primary btn-with-icon"
                      onClick={() => applyYaml(yamlText, importedFiles)}
                      data-testid="yaml-inline-refresh"
                      disabled={!yamlTextStats.hasContent}
                      title="解析当前 YAML 并刷新拓扑"
                    >
                      <Icon d={TRV_ICONS.refresh} className="trv-icon trv-icon--sm" />
                      解析
                    </button>
                    {!importedFiles?.length ? (
                      <div className="yaml-ai-toolbar-cluster">
                        <button
                          type="button"
                          className={`btn-ai btn-with-icon${routeMergeAi.busy ? " btn-ai--busy" : ""}`}
                          disabled={
                            !canRouteMergeAi || routeMergeAi.busy || !yamlTextStats.hasContent
                          }
                          title={
                            routeMergeAiHint ??
                            "将当前编辑区 YAML 与规则引擎摘要发给模型（未使用多文件导入时）"
                          }
                          onClick={() => void routeMergeAi.runAll()}
                        >
                          <Icon d={TRV_ICONS.aiStar} className="trv-icon trv-icon--sm" />
                          {routeMergeAi.busy ? "请求中" : "AI 优化"}
                        </button>
                        <RouteMergeHelpTrigger analysis={routeMergeAnalysis} variant="toolbar" />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary btn-with-icon"
                      onClick={() => updateYamlText("")}
                      data-testid="yaml-clear"
                      disabled={!yamlTextStats.hasContent}
                    >
                      <Icon d={TRV_ICONS.trash} className="trv-icon trv-icon--sm" />
                      清空
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-with-icon"
                      onClick={() => {
                        setImportedFiles(null);
                        setActiveFileIndex(null);
                        updateYamlText(SAMPLE_YAML);
                        setParsedMsg(null);
                        setLeftMode("yaml");
                        applyYaml(SAMPLE_YAML, null);
                      }}
                      data-testid="yaml-restore-sample"
                    >
                      <Icon d={TRV_ICONS.docFile} className="trv-icon trv-icon--sm" />
                      示例
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-with-icon"
                      onClick={() => setYamlPopoutOpen(true)}
                      data-testid="yaml-popout-open"
                      title="放大查看 YAML（Esc 关闭）"
                    >
                      <Icon d={TRV_ICONS.fit} className="trv-icon trv-icon--sm" />
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
                    wrap="off"
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
            nodeTypes={flowNodeTypes}
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
              wrap="off"
              className="yaml-editor yaml-editor-popout"
            />
          </div>
        </div>
      ) : null}

      <RouteMergeAiModal
        open={routeMergeAi.modalOpen}
        onClose={routeMergeAi.closeModal}
        busy={routeMergeAi.busy}
        payload={routeMergeAi.payload}
        error={routeMergeAi.error}
        scopeLabel={routeMergeAi.scopeLabel}
        sourceYaml={routeMergeAi.sourceYaml}
      />
    </div>
  );
}
