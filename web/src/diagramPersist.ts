import { MarkerType, type Connection, type Edge, type Node, type Viewport } from "reactflow";

export const DIAGRAM_FILE_VERSION = 1 as const;

/** 推荐使用此扩展保存（仍是 JSON MIME，便于双击打开时用文本工具查看） */
export const DIAGRAM_FILE_EXTENSION = ".traffic-viz.json";

export type ImportedFilePersist = { name: string; text: string };

export type DiagramFileV1 = {
  schemaVersion: typeof DIAGRAM_FILE_VERSION;
  savedAt: string;
  yamlText: string;
  importedFiles: ImportedFilePersist[] | null;
  activeFileIndex: number | null;
  nodes: Node[];
  edges: Edge[];
  viewport: Pick<Viewport, "x" | "y" | "zoom">;
};

export function isManualEdge(e: Edge): boolean {
  return e.data?.manual === true;
}

function edgeConnectionKey(e: Pick<Edge, "source" | "target" | "sourceHandle" | "targetHandle">) {
  return `${e.source}|${e.target}|${e.sourceHandle ?? ""}|${e.targetHandle ?? ""}`;
}

/**
 * 重新解析 YAML 构图后保留仍有效的「用户连线」，并避免与系统自动边重复。
 */
export function mergeComputedEdgesKeepingManual(
  prev: Edge[],
  computed: Edge[],
  nodeIds: Set<string>,
): Edge[] {
  const keys = new Set(computed.map((e) => edgeConnectionKey(e)));
  const manualKept = prev.filter((e) => {
    if (!isManualEdge(e)) return false;
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
    const k = edgeConnectionKey(e);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
  return [...computed, ...manualKept];
}

/** 手写连线样式：虚线以示与 YAML 拓扑区别 */
export function manualEdgeFromConnection(connection: Connection): Edge {
  return {
    ...connection,
    id: `manual-${crypto.randomUUID()}`,
    type: "smoothstep",
    animated: false,
    data: { manual: true },
    style: {
      stroke: "#475569",
      strokeWidth: 2,
      strokeDasharray: "6 4",
    },
    labelStyle: { fontSize: 11, fill: "#334155", fontWeight: 500 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#475569" },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function serializeDiagram(payload: Omit<DiagramFileV1, "schemaVersion" | "savedAt">): string {
  const doc: DiagramFileV1 = {
    schemaVersion: DIAGRAM_FILE_VERSION,
    savedAt: new Date().toISOString(),
    ...payload,
  };
  return JSON.stringify(doc, null, 2);
}

export function parseDiagramFileJson(raw: unknown): DiagramFileV1 | { error: string } {
  if (!isRecord(raw)) return { error: "文件不是合法的 JSON 对象" };
  if (raw.schemaVersion !== DIAGRAM_FILE_VERSION) {
    return { error: `不支持的 schema 版本（需要 ${DIAGRAM_FILE_VERSION}）` };
  }
  if (typeof raw.savedAt !== "string") return { error: "缺少 savedAt" };
  if (typeof raw.yamlText !== "string") return { error: "缺少 yamlText" };
  if (raw.importedFiles !== null && !Array.isArray(raw.importedFiles)) {
    return { error: "importedFiles 格式错误（应为数组或 null）" };
  }
  if ("importedFiles" in raw && raw.importedFiles !== null) {
    for (const f of raw.importedFiles as unknown[]) {
      if (!isRecord(f) || typeof f.name !== "string" || typeof f.text !== "string") {
        return { error: "importedFiles 项必须为 { name, text }" };
      }
    }
  }
  if (!Array.isArray(raw.nodes)) return { error: "缺少 nodes 数组" };
  if (!Array.isArray(raw.edges)) return { error: "缺少 edges 数组" };
  if (!isRecord(raw.viewport)) return { error: "缺少 viewport" };
  const vp = raw.viewport as Record<string, unknown>;
  const x = vp.x,
    y = vp.y,
    zoom = vp.zoom;
  if (typeof x !== "number" || typeof y !== "number" || typeof zoom !== "number") {
    return { error: "viewport.x / y / zoom 必须为数字" };
  }

  let activeFileIndex: number | null = null;
  if ("activeFileIndex" in raw && raw.activeFileIndex !== undefined) {
    const a = raw.activeFileIndex;
    if (a !== null && (typeof a !== "number" || !Number.isInteger(a))) {
      return { error: "activeFileIndex 应为整数或 null" };
    }
    activeFileIndex = a === null ? null : a;
  }

  const imported: ImportedFilePersist[] | null =
    raw.importedFiles === null ? null : (raw.importedFiles as ImportedFilePersist[]);

  const result: DiagramFileV1 = {
    schemaVersion: DIAGRAM_FILE_VERSION,
    savedAt: raw.savedAt,
    yamlText: raw.yamlText,
    importedFiles: imported,
    activeFileIndex,
    nodes: raw.nodes as Node[],
    edges: raw.edges as Edge[],
    viewport: { x, y, zoom },
  };
  return result;
}
