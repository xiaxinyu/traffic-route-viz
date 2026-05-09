import {
  type ChangeEvent,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useState,
  useRef,
} from "react";
import { Panel, useReactFlow } from "reactflow";
import type { Edge, Node } from "reactflow";

import { exportDiagramToPng } from "./diagramExportPng";
import { exportToDrawioXml } from "./diagramExportDrawio";
import { exportToMermaid } from "./diagramExportMermaid";
import type { DiagramFileV1, ImportedFilePersist } from "./diagramPersist";
import { DIAGRAM_FILE_EXTENSION, parseDiagramFileJson, serializeDiagram } from "./diagramPersist";
import { mergeParseResults, type ImportedYamlFile } from "./mergeYamlBundles";
import { parseK8sYaml } from "./k8sParser";

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

const btnPrimary: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "none",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  ...btnPrimary,
  background: "#fff",
  color: "#334155",
  border: "1px solid #e2e8f0",
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
  const [collapsed, setCollapsed] = useState(false);
  const selectedNodeCount = nodes.filter((n) => n.selected).length;
  const selectedEdgeCount = edges.filter((e) => e.selected).length;
  const hasSelectedEdges = selectedEdgeCount > 0;
  const hasSelectedElements = selectedNodeCount > 0 || selectedEdgeCount > 0;

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
      window.alert("导出 PNG 失败：请稍后重试。");
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
        window.alert("无法读取画图文件（需为合法的 JSON）。");
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
          <span>画布工具</span>
          <span data-testid="diagram-selection-count">
            已选 {selectedNodeCount} 节点 / {selectedEdgeCount} 边
          </span>
          <button
            type="button"
            style={btnGhost}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "展开画布工具" : "收起画布工具"}
            title={collapsed ? "展开" : "收起"}
          >
            {collapsed ? "展开" : "收起"}
          </button>
        </div>

        {!collapsed ? (
          <div className="diagram-toolbar-row">
            <label className="diagram-toolbar-check">
              <input
                data-testid="toggle-edge-labels"
                type="checkbox"
                checked={edgeLabelsEnabled}
                onChange={(e) => setEdgeLabelsEnabled(e.target.checked)}
              />
              边标签
            </label>

            <button
              type="button"
              style={btnGhost}
              onClick={() => fitView({ padding: 0.05, duration: 240 })}
              data-testid="canvas-fit-view"
            >
              适配
            </button>
            <button type="button" style={btnPrimary} onClick={onExportPng} data-testid="export-png">
              PNG
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={onExportMermaid}
              data-testid="export-mermaid"
            >
              Mermaid
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={onExportDrawio}
              data-testid="export-drawio"
            >
              draw.io
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={onSaveDiagramJson}
              data-testid="save-diagram"
            >
              保存
            </button>
            <button
              type="button"
              style={{
                ...btnGhost,
                cursor: hasSelectedEdges ? "pointer" : "not-allowed",
                opacity: hasSelectedEdges ? 1 : 0.55,
              }}
              onClick={onDeleteSelectedEdges}
              data-testid="delete-selected-edges"
              disabled={!hasSelectedEdges}
              title="删除当前选中的连线；也支持键盘 Delete/Backspace"
            >
              删线
            </button>
            <button
              type="button"
              style={{
                ...btnGhost,
                cursor: hasSelectedElements ? "pointer" : "not-allowed",
                opacity: hasSelectedElements ? 1 : 0.55,
              }}
              onClick={onDeleteSelectedElements}
              data-testid="delete-selected-elements"
              disabled={!hasSelectedElements}
              title="删除当前选中的节点与连线（同时会清理其关联边）"
            >
              删除
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={() => loadInputRef.current?.click()}
              data-testid="open-diagram"
            >
              打开
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
