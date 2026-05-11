import type { Edge, Node } from "reactflow";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nodeTitle(n: Node): string {
  const d = (n.data ?? {}) as Record<string, unknown>;
  const primary =
    (typeof d.label === "string" && d.label) ||
    (typeof d.ingressName === "string" && d.ingressName) ||
    (typeof d.serviceName === "string" && d.serviceName) ||
    n.id;
  const t = n.type ?? "node";
  return `${t}\n${primary}`;
}

function absPos(n: Node, byId: Map<string, Node>): { x: number; y: number } {
  let x = n.position?.x ?? 0;
  let y = n.position?.y ?? 0;
  let p = n.parentNode ? byId.get(n.parentNode) : undefined;
  while (p) {
    x += p.position?.x ?? 0;
    y += p.position?.y ?? 0;
    p = p.parentNode ? byId.get(p.parentNode) : undefined;
  }
  return { x, y };
}

/**
 * Minimal draw.io (mxGraph) XML export.
 * - Uses nodes' current positions (absolute) as geometry.
 * - Imports into draw.io via File -> Import From -> Device (or open the .drawio.xml).
 */
export function exportToDrawioXml(
  nodes: Node[],
  edges: Edge[],
  diagramName = "traffic-route-viz",
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const realNodes = nodes.filter((n) => n.type !== "ingressRegion" && n.type !== "junction");
  const realIds = new Set(realNodes.map((n) => n.id));

  // draw.io cell ids must be numeric-ish or unique strings. We'll prefix.
  const cellId = (id: string) => `n_${id.replace(/[^a-zA-Z0-9_:-]/g, "_")}`;

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="traffic-route-viz">`,
  );
  parts.push(`  <diagram name="${esc(diagramName)}">`);
  parts.push(
    '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" math="0" shadow="0">',
  );
  parts.push("      <root>");
  parts.push('        <mxCell id="0"/>');
  parts.push('        <mxCell id="1" parent="0"/>');

  for (const n of realNodes) {
    const id = cellId(n.id);
    const { x, y } = absPos(n, byId);
    const w = typeof n.width === "number" ? n.width : 260;
    const h = typeof n.height === "number" ? n.height : 90;
    const value = esc(nodeTitle(n));
    const style =
      "rounded=1;whiteSpace=wrap;html=1;strokeColor=#94a3b8;fillColor=#ffffff;fontSize=12;spacing=10;";
    parts.push(
      `        <mxCell id="${esc(id)}" value="${value}" style="${style}" vertex="1" parent="1">`,
    );
    parts.push(
      `          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`,
    );
    parts.push("        </mxCell>");
  }

  let edgeIdx = 0;
  for (const e of edges) {
    if (!realIds.has(e.source) || !realIds.has(e.target)) continue;
    const id = `e_${edgeIdx++}`;
    const value = typeof e.label === "string" ? esc(e.label) : "";
    const style = "endArrow=block;rounded=1;html=1;strokeColor=#64748b;";
    parts.push(
      `        <mxCell id="${id}" value="${value}" style="${style}" edge="1" parent="1" source="${esc(
        cellId(e.source),
      )}" target="${esc(cellId(e.target))}">`,
    );
    parts.push('          <mxGeometry relative="1" as="geometry"/>');
    parts.push("        </mxCell>");
  }

  parts.push("      </root>");
  parts.push("    </mxGraphModel>");
  parts.push("  </diagram>");
  parts.push("</mxfile>");

  return parts.join("\n");
}
