import type { Edge, Node } from "reactflow";

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function nodeLabel(n: Node): string {
  const t = n.type ?? "node";
  const d = (n.data ?? {}) as Record<string, unknown>;
  const primary =
    (typeof d.label === "string" && d.label) ||
    (typeof d.ingressName === "string" && d.ingressName) ||
    (typeof d.serviceName === "string" && d.serviceName) ||
    n.id;
  return `${t}: ${primary}`.replace(/"/g, '\\"');
}

/**
 * Export current graph to Mermaid flowchart source.
 * Notes:
 * - Mermaid cannot fully represent React Flow parent/extent; we export a readable edge list.
 * - Region panels are omitted as nodes; edges are preserved.
 */
export function exportToMermaid(nodes: Node[], edges: Edge[]): string {
  const realNodes = nodes.filter((n) => n.type !== "ingressRegion");
  const nodeIds = new Set(realNodes.map((n) => n.id));
  const idMap = new Map<string, string>();
  for (const n of realNodes) idMap.set(n.id, safeId(n.id));

  const lines: string[] = [];
  lines.push("flowchart LR");
  for (const n of realNodes) {
    const mid = idMap.get(n.id)!;
    lines.push(`  ${mid}["${nodeLabel(n)}"]`);
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    const s = idMap.get(e.source)!;
    const t = idMap.get(e.target)!;
    const label = typeof e.label === "string" && e.label.trim() ? e.label.trim() : "";
    if (label) lines.push(`  ${s} -->|${label.replace(/\|/g, "/")}| ${t}`);
    else lines.push(`  ${s} --> ${t}`);
  }

  return lines.join("\n") + "\n";
}

