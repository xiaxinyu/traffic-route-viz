import {
  type ChangeEvent,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
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
};

const btnPrimary: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "none",
  background: "#4f46e5",
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

const btnCompact: CSSProperties = {
  ...btnPrimary,
  padding: "8px 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  boxShadow: "0 2px 12px rgba(15,23,42,0.10)",
};

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
  } = props;

  const { getViewport, setViewport } = useReactFlow();
  const loadInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);

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
      await exportDiagramToPng(el, `traffic-route-viz-${Date.now()}.png`);
    } catch {
      window.alert("导出 PNG 失败：请稍后重试，或缩放画布后再导出。");
    }
  }, [flowContainerRef]);

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

  return (
    <Panel position="top-right" style={{ marginRight: 8, marginTop: 8 }}>
      <div
        data-save-png-hide="true"
        data-testid="diagram-toolbar"
        className="diagram-toolbar-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: open ? "8px 10px" : 0,
          background: open ? "rgba(255,255,255,0.96)" : "transparent",
          borderRadius: open ? 12 : 999,
          border: open ? "1px solid #e2e8f0" : "none",
          boxShadow: open ? "0 2px 12px rgba(15,23,42,0.08)" : "none",
          minWidth: open ? 156 : undefined,
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
        }}
      >
        <button
          type="button"
          style={btnCompact}
          onClick={() => setOpen((v) => !v)}
          data-testid="diagram-actions-toggle"
          aria-expanded={open}
          title="画布操作"
        >
          <span style={{ fontWeight: 800 }}>操作</span>
          <span style={{ opacity: 0.9, fontWeight: 900 }}>{open ? "×" : "⋯"}</span>
        </button>

        {open ? (
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#64748b",
                letterSpacing: 0.3,
                marginTop: 2,
              }}
            >
              画布工具
            </div>
            <button
              type="button"
              style={btnPrimary}
              onClick={async () => {
                await onExportPng();
                setOpen(false);
              }}
              data-testid="export-png"
            >
              导出 PNG
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={() => {
                onExportMermaid();
                setOpen(false);
              }}
              data-testid="export-mermaid"
            >
              导出 Mermaid
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={() => {
                onExportDrawio();
                setOpen(false);
              }}
              data-testid="export-drawio"
            >
              导出 draw.io
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={() => {
                onSaveDiagramJson();
                setOpen(false);
              }}
              data-testid="save-diagram"
            >
              保存画图文件
            </button>
            <button
              type="button"
              style={btnGhost}
              onClick={() => loadInputRef.current?.click()}
              data-testid="open-diagram"
            >
              打开画图文件…
            </button>
            <input
              ref={loadInputRef}
              type="file"
              accept=".traffic-viz.json,application/json,.json"
              style={{ display: "none" }}
              onChange={onDiagramFileChosen}
            />
            <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.35 }}>
              画图文件（React Flow JSON）：可用 VS Code/Cursor 打开；可导出 Mermaid / draw.io
              供第三方工具打开。
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
