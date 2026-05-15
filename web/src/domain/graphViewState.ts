import type { Edge, Node } from "reactflow";

import { countYamlTextLines, normalizeYamlNewlines, stripK8sMetadataNoise } from "./yamlLineStats";

export type NodeTypeFilter =
  | "all"
  | "ingressRegion"
  | "ingress"
  | "istioGateway"
  | "httpProxy"
  | "host"
  | "route"
  | "istioDestination"
  | "service"
  | "destinationRule"
  | "endpoints";

export const NODE_TYPE_ORDER: NodeTypeFilter[] = [
  "all",
  "ingressRegion",
  "ingress",
  "istioGateway",
  "httpProxy",
  "host",
  "route",
  "istioDestination",
  "service",
  "destinationRule",
  "endpoints",
];

const NODE_TYPE_LABELS: Record<Exclude<NodeTypeFilter, "all">, string> = {
  ingressRegion: "Region",
  ingress: "Ingress",
  istioGateway: "Istio Gateway",
  httpProxy: "Contour Gateway",
  host: "Host",
  route: "Route",
  istioDestination: "VS Destination",
  service: "Service",
  destinationRule: "DestinationRule",
  endpoints: "Endpoints",
};

export function nodeTypeLabel(type: NodeTypeFilter): string {
  if (type === "all") return "All";
  return NODE_TYPE_LABELS[type] ?? type;
}

export function buildGraphMetrics(nodes: Node[], edges: Edge[]) {
  const counts: Record<NodeTypeFilter, number> = {
    all: nodes.length,
    ingressRegion: 0,
    ingress: 0,
    istioGateway: 0,
    httpProxy: 0,
    host: 0,
    route: 0,
    istioDestination: 0,
    service: 0,
    destinationRule: 0,
    endpoints: 0,
  };

  for (const n of nodes) {
    const t = (n.type ?? "") as NodeTypeFilter;
    if (t in counts) counts[t] += 1;
  }

  const manualEdges = edges.filter((e) => e.data?.manual === true).length;
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    manualEdgeCount: manualEdges,
    autoEdgeCount: edges.length - manualEdges,
    typeCounts: counts,
  };
}

export function buildSelectionMetrics(nodes: Node[], edges: Edge[]) {
  return {
    selectedNodeCount: nodes.filter((n) => n.selected).length,
    selectedEdgeCount: edges.filter((e) => e.selected).length,
  };
}

export function buildYamlTextStats(text: string) {
  const normalized = normalizeYamlNewlines(stripK8sMetadataNoise(text));
  const trimmed = normalized.trim();
  const documentCount = trimmed
    ? normalized
        .split(/^---\s*$/m)
        .map((part) => part.trim())
        .filter(Boolean).length
    : 0;

  return {
    lineCount: countYamlTextLines(text),
    characterCount: normalized.length,
    documentCount,
    hasContent: trimmed.length > 0,
  };
}

export function applyCanvasSelection<T extends { id: string; selected?: boolean }>(
  items: T[],
  selectedId: string | null,
  additive: boolean,
): T[] {
  return items.map((item) => {
    const currentlySelected = item.selected === true;
    const nextSelected =
      selectedId === null
        ? false
        : item.id === selectedId
          ? additive
            ? !currentlySelected
            : true
          : additive
            ? currentlySelected
            : false;

    return currentlySelected === nextSelected ? item : { ...item, selected: nextSelected };
  });
}

export type GraphViewOptions = {
  query: string;
  typeFilter: NodeTypeFilter;
};

export type GraphPresentation = {
  nodes: Node[];
  edges: Edge[];
  matchedNodeIds: string[];
};

function toCorpus(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (Array.isArray(v)) return v.map((x) => toCorpus(x)).join(" ");
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>)
      .map((x) => toCorpus(x))
      .join(" ");
  }
  return "";
}

// Perf: buildGraphPresentation runs often during interactions (selection/drag/search).
// We keep a WeakMap cache keyed by object identity to avoid repeatedly stringifying large node.data blobs.
const nodeCorpusCache = new WeakMap<object, string>();

export function buildGraphPresentation(
  baseNodes: Node[],
  baseEdges: Edge[],
  options: GraphViewOptions,
): GraphPresentation {
  const query = options.query.trim().toLowerCase();
  const hasQuery = query.length > 0;
  const hasTypeFilter = options.typeFilter !== "all";

  // No query/type focus => return raw graph to preserve default styles/animations/editability UX.
  if (!hasQuery && !hasTypeFilter) {
    return { nodes: baseNodes, edges: baseEdges, matchedNodeIds: [] };
  }

  const matched = new Set<string>();

  for (const n of baseNodes) {
    const typeMatch = options.typeFilter === "all" || n.type === options.typeFilter;
    if (!typeMatch) continue;

    if (!hasQuery) {
      matched.add(n.id);
      continue;
    }

    const cacheKey = (n as unknown as object) ?? null;
    let corpus = cacheKey ? nodeCorpusCache.get(cacheKey) : undefined;
    if (!corpus) {
      corpus = `${n.id} ${n.type ?? ""} ${toCorpus(n.data)}`.toLowerCase();
      if (cacheKey) nodeCorpusCache.set(cacheKey, corpus);
    }
    if (corpus.includes(query)) matched.add(n.id);
  }

  const nodes = baseNodes.map((n) => {
    const isMatched = matched.has(n.id);
    const dimmed = (hasQuery || options.typeFilter !== "all") && !isMatched;

    if (!dimmed && !isMatched) return n;

    const style = {
      ...(n.style ?? {}),
      opacity: dimmed ? 0.22 : 1,
      filter: dimmed ? "saturate(0.65)" : "none",
      boxShadow: isMatched
        ? "0 0 0 3px rgba(13,148,136,0.24), 0 8px 22px rgba(15,23,42,0.16)"
        : (n.style?.boxShadow ?? "none"),
    };

    return { ...n, style };
  });

  const edges = baseEdges.map((e) => {
    const sourceHit = matched.has(e.source);
    const targetHit = matched.has(e.target);
    const isMatched = sourceHit || targetHit;
    const dimmed = (hasQuery || options.typeFilter !== "all") && !isMatched;

    if (!dimmed && !isMatched) return e;

    const style = {
      ...(e.style ?? {}),
      opacity: dimmed ? 0.16 : 1,
      strokeWidth: isMatched ? 2.2 : (e.style?.strokeWidth ?? 1.4),
      stroke: isMatched ? "#0f766e" : (e.style?.stroke ?? "#94a3b8"),
    };

    return {
      ...e,
      animated: isMatched ? true : e.animated,
      style,
    };
  });

  return { nodes, edges, matchedNodeIds: [...matched] };
}

export function formatClockTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
