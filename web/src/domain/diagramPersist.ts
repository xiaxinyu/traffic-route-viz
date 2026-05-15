import {
  MarkerType,
  reconnectEdge,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
} from "reactflow";

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

const MANUAL_EDGE_COLOR = "#475569";
const MANUAL_EDGE_DASH = "6 4";

function randomHex(bytes: number): string {
  const g = globalThis.crypto;
  if (g && typeof g.getRandomValues === "function") {
    const arr = new Uint8Array(bytes);
    g.getRandomValues(arr);
    return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  for (let i = 0; i < bytes; i += 1) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return out;
}

/** Cross-runtime UUID-like id generator (crypto.randomUUID fallback for legacy/insecure env). */
export function createEdgeNonce(): string {
  const g = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  return `${Date.now().toString(36)}-${randomHex(8)}`;
}

function toManualEdge(edge: Edge): Edge {
  return {
    ...edge,
    id: edge.id.startsWith("manual-") ? edge.id : `manual-${createEdgeNonce()}`,
    type: "smoothstep",
    animated: false,
    data: { ...(edge.data ?? {}), manual: true },
    style: {
      ...(edge.style ?? {}),
      stroke: MANUAL_EDGE_COLOR,
      strokeWidth: 2,
      strokeDasharray: MANUAL_EDGE_DASH,
    },
    labelStyle: { ...(edge.labelStyle ?? {}), fontSize: 11, fill: "#334155", fontWeight: 500 },
    markerEnd: { type: MarkerType.ArrowClosed, color: MANUAL_EDGE_COLOR },
    selectable: true,
    deletable: true,
    updatable: true,
    reconnectable: true,
    focusable: true,
    interactionWidth: edge.interactionWidth ?? 40,
  } as unknown as Edge;
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

function readNodeKey(n: Node): string | null {
  const v = (n as Node & { data?: unknown }).data as unknown;
  if (!v || typeof v !== "object") return null;
  const key = (v as Record<string, unknown>).nodeKey;
  return typeof key === "string" && key ? key : null;
}

function readStyleWH(style: unknown): { w: number; h: number } | null {
  if (typeof style !== "object" || style === null) return null;
  const s = style as { width?: unknown; height?: unknown };
  const w = typeof s.width === "number" ? s.width : Number.parseFloat(String(s.width ?? ""));
  const h = typeof s.height === "number" ? s.height : Number.parseFloat(String(s.height ?? ""));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 80 || h < 80) return null;
  return { w, h };
}

/**
 * 保留用户在画布上拉大的分区（`ingressRegion`）宽/高；与重新构图后的尺寸取 **max**。
 * 内容变矮/变窄时仍至少满足新拓扑的估算包围盒。
 */
export function mergeIngressRegionDimensionsFromPrevious(
  prevNodes: Node[],
  computedNodes: Node[],
): Node[] {
  const prevByKey = new Map<string, { w: number; h: number }>();
  for (const n of prevNodes) {
    if (n.type !== "ingressRegion") continue;
    const key = readNodeKey(n);
    const wh = readStyleWH(n.style);
    if (key && wh) prevByKey.set(key, wh);
  }
  if (!prevByKey.size) return computedNodes;

  return computedNodes.map((node) => {
    if (node.type !== "ingressRegion") return node;
    const key = readNodeKey(node);
    if (!key) return node;
    const kept = prevByKey.get(key);
    const cur = readStyleWH(node.style);
    if (!kept || !cur) return node;
    return {
      ...node,
      style: {
        ...(node.style ?? {}),
        width: Math.max(kept.w, cur.w),
        height: Math.max(kept.h, cur.h),
      },
    };
  });
}

/**
 * 重新解析后保留手写边，并在节点 id 发生再生成时尝试按 `node.data.nodeKey` 重映射端点。
 *
 * This prevents manual edges from being lost when node ids are regenerated (e.g. route indices change).
 */
export function mergeComputedEdgesKeepingManualWithNodeRemap(
  prevEdges: Edge[],
  prevNodes: Node[],
  computedEdges: Edge[],
  nextNodes: Node[],
): Edge[] {
  const nextIds = new Set(nextNodes.map((n) => n.id));
  const computedKeys = new Set(computedEdges.map((e) => edgeConnectionKey(e)));

  const prevIdToKey = new Map<string, string>();
  for (const n of prevNodes) {
    const k = readNodeKey(n);
    if (k) prevIdToKey.set(n.id, k);
  }

  const nextKeyToId = new Map<string, string>();
  for (const n of nextNodes) {
    const k = readNodeKey(n);
    if (k) nextKeyToId.set(k, n.id);
  }

  const kept: Edge[] = [];
  for (const e of prevEdges) {
    if (!isManualEdge(e)) continue;

    let source = e.source;
    let target = e.target;

    if (!nextIds.has(source)) {
      const k = prevIdToKey.get(source);
      const mapped = k ? nextKeyToId.get(k) : undefined;
      if (mapped) source = mapped;
    }
    if (!nextIds.has(target)) {
      const k = prevIdToKey.get(target);
      const mapped = k ? nextKeyToId.get(k) : undefined;
      if (mapped) target = mapped;
    }

    if (!nextIds.has(source) || !nextIds.has(target)) continue;

    const migrated: Edge =
      source === e.source && target === e.target ? e : ({ ...e, source, target } as Edge);
    const k = edgeConnectionKey(migrated);
    if (computedKeys.has(k)) continue;
    computedKeys.add(k);
    kept.push(migrated);
  }

  return [...computedEdges, ...kept];
}

/** 手写连线样式：虚线以示与 YAML 拓扑区别 */
export function manualEdgeFromConnection(connection: Connection): Edge {
  if (!connection.source || !connection.target) {
    // React Flow types allow null, but we only persist valid edges.
    throw new Error("Invalid connection: missing source or target");
  }
  return toManualEdge({
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
    id: `manual-${createEdgeNonce()}`,
  });
}

/**
 * 用户重连任意边后，统一按“手写边”持久化，避免解析刷新时丢失人工调整。
 */
export function reconnectEdgeAsManual(
  oldEdge: Edge,
  connection: Connection,
  edges: Edge[],
): Edge[] {
  const reconnected = reconnectEdge(oldEdge, connection, edges, { shouldReplaceId: false });
  return reconnected.map((e) => (e.id === oldEdge.id ? toManualEdge(e) : e));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function serializeDiagram(
  payload: Omit<DiagramFileV1, "schemaVersion" | "savedAt">,
): string {
  const doc: DiagramFileV1 = {
    schemaVersion: DIAGRAM_FILE_VERSION,
    savedAt: new Date().toISOString(),
    ...payload,
  };
  return JSON.stringify(doc, null, 2);
}

export function parseDiagramFileJson(raw: unknown): DiagramFileV1 | { error: string } {
  if (!isRecord(raw)) return { error: "File is not a valid JSON object" };
  if (raw.schemaVersion !== DIAGRAM_FILE_VERSION) {
    return { error: `Unsupported schema version (expected ${DIAGRAM_FILE_VERSION})` };
  }
  if (typeof raw.savedAt !== "string") return { error: "Missing savedAt" };
  if (typeof raw.yamlText !== "string") return { error: "Missing yamlText" };
  if (raw.importedFiles !== null && !Array.isArray(raw.importedFiles)) {
    return { error: "importedFiles must be an array or null" };
  }
  if ("importedFiles" in raw && raw.importedFiles !== null) {
    for (const f of raw.importedFiles as unknown[]) {
      if (!isRecord(f) || typeof f.name !== "string" || typeof f.text !== "string") {
        return { error: "Each importedFiles entry must be { name, text }" };
      }
    }
  }
  if (!Array.isArray(raw.nodes)) return { error: "Missing nodes array" };
  if (!Array.isArray(raw.edges)) return { error: "Missing edges array" };
  if (!isRecord(raw.viewport)) return { error: "Missing viewport" };
  const vp = raw.viewport as Record<string, unknown>;
  const x = vp.x,
    y = vp.y,
    zoom = vp.zoom;
  if (typeof x !== "number" || typeof y !== "number" || typeof zoom !== "number") {
    return { error: "viewport.x, viewport.y, and viewport.zoom must be numbers" };
  }

  let activeFileIndex: number | null = null;
  if ("activeFileIndex" in raw && raw.activeFileIndex !== undefined) {
    const a = raw.activeFileIndex;
    if (a !== null && (typeof a !== "number" || !Number.isInteger(a))) {
      return { error: "activeFileIndex must be an integer or null" };
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
