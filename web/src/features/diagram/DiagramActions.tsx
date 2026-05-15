import {
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import { Panel, useReactFlow } from "reactflow";
import type { Edge, Node } from "reactflow";

import { exportDiagramToPng } from "../../domain/diagramExportPng";
import { exportToDrawioXml } from "../../domain/diagramExportDrawio";
import { exportToMermaid } from "../../domain/diagramExportMermaid";
import type { DiagramFileV1, ImportedFilePersist } from "../../domain/diagramPersist";
import { DIAGRAM_FILE_EXTENSION, parseDiagramFileJson, serializeDiagram } from "../../domain/diagramPersist";
import { mergeParseResults, type ImportedYamlFile } from "../../domain/mergeYamlBundles";
import { parseK8sYaml } from "../../domain/k8sParser";

type Props = {
  yamlText: string;
  setYamlText: (s: string) => void;
  importedFiles: ImportedYamlFile[] | null;
  setImportedFiles: Dispatch<SetStateAction<ImportedYamlFile[] | null>>;
  activeFileIndex: number | null;
  setActiveFileIndex: Dispatch<SetStateAction<number | null>>;
  nodes: Node[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setParsedMsg: (s: string | null) => void;
  flowContainerRef: RefObject<HTMLDivElement | null>;
  edgeLabelsEnabled: boolean;
  setEdgeLabelsEnabled: Dispatch<SetStateAction<boolean>>;
};

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL.createObjectURL(blob);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 250);
}

function parseBannerForYaml(yt: string, files: ImportedYamlFile[] | null): string | null {
  const p = files?.length
    ? mergeParseResults(files.map((f) => parseK8sYaml(f.text, f.name)))
    : parseK8sYaml(yt);
  return p.errors.length ? p.errors.join("\n") : null;
}

export function DiagramActions(props: Props) {
  const {
    yamlText,
    setYamlText,
    importedFiles,
    setImportedFiles,
    activeFileIndex,
    setActiveFileIndex,
    nodes,
    edges,
    setNodes,
    setEdges,
    setParsedMsg,
    flowContainerRef,
    edgeLabelsEnabled,
    setEdgeLabelsEnabled,
  } = props;

  const { fitView, getViewport, setViewport } = useReactFlow();
  const loadInputRef = useRef<HTMLInputElement | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const selectedNodeCount = nodes.filter((n) => n.selected).length;
  const selectedEdgeCount = edges.filter((e) => e.selected).length;
  const hasSelectedEdges = selectedEdgeCount > 0;
  const hasSelectedElements = selectedNodeCount > 0 || selectedEdgeCount > 0;

  const Icon = ({ d, className }: { d: string; className?: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? "trv-icon"}>
      <path d={d} fill="currentColor" />
    </svg>
  );

  useEffect(() => {
    const onChange = () => {
      const el = flowContainerRef.current ?? null;
      const fsEl = document.fullscreenElement;
      setIsFullscreen(Boolean(el && fsEl === el));
    };
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [flowContainerRef]);

  const toggleFullscreen = useCallback(async () => {
    const el = flowContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
        return;
      }
      await el.requestFullscreen();
    } catch {
      window.alert("Could not enter fullscreen (browser blocked the request).");
    }
  }, [flowContainerRef]);

  const onSaveDiagramJson = useCallback(() => {
    const vp = getViewport();
    const importedPersist: ImportedFilePersist[] | null = importedFiles
      ? importedFiles.map(({ name, text }) => ({ name, text }))
      : null;
    const json = serializeDiagram({
      yamlText,
      importedFiles: importedPersist,
      activeFileIndex,
      nodes,
      edges,
      viewport: { x: vp.x, y: vp.y, zoom: vp.zoom },
    });
    const name = `traffic-route-viz${DIAGRAM_FILE_EXTENSION}`;
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.download = name;
    a.href = URL.createObjectURL(blob);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 250);
  }, [yamlText, importedFiles, activeFileIndex, nodes, edges, getViewport]);

  const onExportPng = useCallback(async () => {
    const wrap = flowContainerRef.current?.querySelector?.(".react-flow") as HTMLElement | null;
    const el = wrap ?? flowContainerRef.current;
    if (!el) return;
    try {
      await exportDiagramToPng(el, nodes, `traffic-route-viz-${Date.now()}.png`);
    } catch {
      window.alert("PNG export failed. Try again.");
    }
  }, [flowContainerRef, nodes]);

  const onExportMermaid = useCallback(() => {
    const text = exportToMermaid(nodes, edges);
    downloadText(`traffic-route-viz-${Date.now()}.mmd`, text, "text/plain;charset=utf-8");
  }, [nodes, edges]);

  const onExportDrawio = useCallback(() => {
    const xml = exportToDrawioXml(nodes, edges, "traffic-route-viz");
    downloadText(
      `traffic-route-viz-${Date.now()}.drawio.xml`,
      xml,
      "application/xml;charset=utf-8",
    );
  }, [nodes, edges]);

  const applyLoadedDiagram = useCallback(
    (data: DiagramFileV1) => {
      const files: ImportedYamlFile[] | null = data.importedFiles
        ? data.importedFiles.map((f) => ({ name: f.name, text: f.text }))
        : null;

      setYamlText(data.yamlText);
      setImportedFiles(files);
      setActiveFileIndex(data.activeFileIndex ?? null);

      setNodes(data.nodes);
      setEdges(data.edges);

      setParsedMsg(parseBannerForYaml(data.yamlText, files));

      requestAnimationFrame(() => {
        setViewport(data.viewport);
      });
    },
    [
      setYamlText,
      setImportedFiles,
      setActiveFileIndex,
      setNodes,
      setEdges,
      setParsedMsg,
      setViewport,
    ],
  );

  const onDiagramFileChosen = useCallback(
    async (ev: ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      ev.target.value = "";
      if (!file) return;

      try {
        const raw: unknown = JSON.parse(await file.text());
        const result = parseDiagramFileJson(raw);
        if ("error" in result) {
          window.alert(result.error);
          return;
        }
        applyLoadedDiagram(result);
      } catch {
        window.alert("Could not read diagram file (invalid JSON).");
      }
    },
    [applyLoadedDiagram],
  );
  const onDeleteSelectedEdges = useCallback(() => {
    setEdges((prev) => prev.filter((e) => !e.selected));
  }, [setEdges]);
  const onDeleteSelectedElements = useCallback(() => {
    setNodes((prevNodes) => {
      const selectedNodeIds = new Set(prevNodes.filter((n) => n.selected).map((n) => n.id));
      setEdges((prevEdges) =>
        prevEdges.filter(
          (e) => !e.selected && !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target),
        ),
      );
      if (!selectedNodeIds.size) return prevNodes;
      return prevNodes.filter((n) => !selectedNodeIds.has(n.id));
    });
  }, [setEdges, setNodes]);

  return (
    <Panel
      position="top-right"
      style={{ marginRight: 8, marginTop: 8, maxWidth: "min(720px, 72vw)" }}
    >
      <div
        data-save-png-hide="true"
        data-testid="diagram-toolbar"
        className="diagram-toolbar-panel"
      >
        <div className="diagram-toolbar-head">
          <span>Canvas</span>
          <span data-testid="diagram-selection-count">
            {selectedNodeCount} node(s) / {selectedEdgeCount} edge(s)
          </span>
          <button
            type="button"
            className="btn-secondary btn-icon diagram-toolbar-icon-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          >
            <Icon
              d={
                isFullscreen
                  ? "M9 3H5a2 2 0 0 0-2 2v4h2V5h4V3zm10 0h-4v2h4v4h2V5a2 2 0 0 0-2-2zM5 15H3v4a2 2 0 0 0 2 2h4v-2H5v-4zm16 0h-2v4h-4v2h4a2 2 0 0 0 2-2v-4z"
                  : "M7 14H5v5h5v-2H7v-3zm0-4h3V7h2v5H7V10zm12 9h-5v-2h3v-3h2v5zM14 7h5v5h-2V9h-3V7z"
              }
            />
          </button>
          <button
            type="button"
            className="btn-secondary btn-icon diagram-toolbar-icon-btn"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand canvas tools" : "Collapse canvas tools"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <Icon d={collapsed ? "M7 10l5 5 5-5" : "M7 14l5-5 5 5"} />
          </button>
        </div>

        {!collapsed ? (
          <div className="diagram-toolbar-row">
            <label className="diagram-toolbar-check" title="Edge labels">
              <input
                data-testid="toggle-edge-labels"
                type="checkbox"
                checked={edgeLabelsEnabled}
                onChange={(e) => setEdgeLabelsEnabled(e.target.checked)}
              />
              <span className="diagram-toolbar-check-text">Edge labels</span>
            </label>

            <button
              type="button"
              className="btn-secondary btn-icon diagram-toolbar-icon-btn"
              onClick={() => fitView({ padding: 0.05, duration: 240 })}
              data-testid="canvas-fit-view"
              aria-label="Fit view"
              title="Fit view"
            >
              <Icon d="M4 7V4h3v2H6v1H4zm14-1V4h3v3h-2V6h-1zm1 15h2v-3h-2v1h-1v2h1zm-15 0v-3h2v1h1v2H4z" />
            </button>
            <button
              type="button"
              className="btn-primary btn-icon diagram-toolbar-icon-btn"
              onClick={onExportPng}
              data-testid="export-png"
              title="Export PNG"
              aria-label="Export PNG"
            >
              <Icon d="M21 19H3V5h18v14zm-2-2V7H5v10h14zM7 15l2.5-3 2 2.5L15 10l2 5H7z" />
            </button>
            <button
              type="button"
              className="btn-secondary btn-icon diagram-toolbar-icon-btn"
              onClick={onExportMermaid}
              data-testid="export-mermaid"
              aria-label="Mermaid"
              title="Mermaid"
            >
              <Icon d="M4 19V5h16v14H4zm2-2h12V7H6v10zm2-8h8v2H8V9zm0 4h6v2H8v-2z" />
            </button>
            <button
              type="button"
              className="btn-secondary btn-icon diagram-toolbar-icon-btn"
              onClick={onExportDrawio}
              data-testid="export-drawio"
              aria-label="draw.io"
              title="draw.io"
            >
              <Icon d="M7 7h10v4H7V7zm0 6h4v4H7v-4zm6 0h4v4h-4v-4z" />
            </button>
            <button
              type="button"
              className="btn-secondary btn-icon diagram-toolbar-icon-btn"
              onClick={onSaveDiagramJson}
              data-testid="save-diagram"
              aria-label="Save"
              title="Save"
            >
              <Icon d="M17 3H5a2 2 0 0 0-2 2v14h18V7l-4-4zM7 5h8v4H7V5zm5 12H6v-6h6v6zm2 0v-6h4v6h-4z" />
            </button>
            <button
              type="button"
              className="btn-secondary btn-icon diagram-toolbar-icon-btn"
              onClick={onDeleteSelectedEdges}
              data-testid="delete-selected-edges"
              disabled={!hasSelectedEdges}
              title="Delete selected edges (Delete / Backspace)"
              aria-label="Delete edges"
            >
              <Icon d="M6 6l12 12M18 6L6 18" />
            </button>
            <button
              type="button"
              className="btn-secondary btn-icon diagram-toolbar-icon-btn"
              onClick={onDeleteSelectedElements}
              data-testid="delete-selected-elements"
              disabled={!hasSelectedElements}
              title="Delete selected nodes and edges"
              aria-label="Delete"
            >
              <Icon d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
            </button>
            <button
              type="button"
              className="btn-secondary btn-icon diagram-toolbar-icon-btn"
              onClick={() => loadInputRef.current?.click()}
              data-testid="open-diagram"
              aria-label="Open"
              title="Open"
            >
              <Icon d="M10 4H4v16h16V8h-8l-2-4zm-4 6h12v8H6v-8z" />
            </button>
          </div>
        ) : null}
        <input
          ref={loadInputRef}
          type="file"
          accept=".traffic-viz.json,application/json,.json"
          style={{ display: "none" }}
          onChange={onDiagramFileChosen}
        />
      </div>
    </Panel>
  );
}
