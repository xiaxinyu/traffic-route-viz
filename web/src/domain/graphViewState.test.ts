import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";

import {
  applyCanvasSelection,
  buildGraphMetrics,
  buildGraphPresentation,
  buildSelectionMetrics,
  buildYamlTextStats,
  formatClockTime,
  nodeTypeLabel,
} from "./graphViewState";

function node(id: string, type: string, data: Record<string, unknown>): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  };
}

describe("buildGraphMetrics", () => {
  it("counts nodes/edges/manual edges by type", () => {
    const nodes: Node[] = [
      node("n-1", "ingress", { label: "ing-a" }),
      node("n-2", "service", { label: "svc-a" }),
      node("n-3", "service", { label: "svc-b" }),
    ];
    const edges: Edge[] = [
      { id: "e-1", source: "n-1", target: "n-2" },
      { id: "manual-1", source: "n-2", target: "n-3", data: { manual: true } },
    ];

    const metrics = buildGraphMetrics(nodes, edges);
    expect(metrics.nodeCount).toBe(3);
    expect(metrics.edgeCount).toBe(2);
    expect(metrics.manualEdgeCount).toBe(1);
    expect(metrics.autoEdgeCount).toBe(1);
    expect(metrics.typeCounts.ingress).toBe(1);
    expect(metrics.typeCounts.service).toBe(2);
  });
});

describe("buildSelectionMetrics", () => {
  it("counts selected nodes and edges", () => {
    const nodes: Node[] = [
      { ...node("n-1", "ingress", {}), selected: true },
      node("n-2", "service", {}),
    ];
    const edges: Edge[] = [
      { id: "e-1", source: "n-1", target: "n-2", selected: true },
      { id: "e-2", source: "n-2", target: "n-1" },
    ];

    expect(buildSelectionMetrics(nodes, edges)).toEqual({
      selectedNodeCount: 1,
      selectedEdgeCount: 1,
    });
  });
});

describe("buildYamlTextStats", () => {
  it("counts lines, characters and YAML documents", () => {
    const text = "apiVersion: v1\nkind: Service\n---\napiVersion: v1\nkind: Endpoints\n";

    expect(buildYamlTextStats(text)).toEqual({
      lineCount: 6,
      characterCount: text.length,
      documentCount: 2,
      hasContent: true,
    });
  });

  it("treats whitespace-only YAML as empty", () => {
    expect(buildYamlTextStats(" \n ")).toEqual({
      lineCount: 2,
      characterCount: 3,
      documentCount: 0,
      hasContent: false,
    });
  });
});

describe("applyCanvasSelection", () => {
  it("selects one item and clears the rest", () => {
    const out = applyCanvasSelection([{ id: "a", selected: true }, { id: "b" }], "b", false);

    expect(out.map((x) => x.selected === true)).toEqual([false, true]);
  });

  it("toggles selected item in additive mode", () => {
    const out = applyCanvasSelection(
      [
        { id: "a", selected: true },
        { id: "b", selected: true },
      ],
      "b",
      true,
    );

    expect(out.map((x) => x.selected === true)).toEqual([true, false]);
  });

  it("clears all items when selected id is null", () => {
    const out = applyCanvasSelection([{ id: "a", selected: true }], null, false);
    expect(out[0].selected).toBe(false);
  });
});

describe("buildGraphPresentation", () => {
  const baseNodes: Node[] = [
    node("ing-a", "ingress", { label: "rbac-ingress" }),
    node("svc-a", "service", { label: "rbac-service" }),
    node("ep-a", "endpoints", { ips: ["10.0.0.1"] }),
  ];
  const baseEdges: Edge[] = [
    { id: "e-1", source: "ing-a", target: "svc-a" },
    { id: "e-2", source: "svc-a", target: "ep-a" },
  ];

  it("passes through raw nodes/edges when no query and no type filter", () => {
    const view = buildGraphPresentation(baseNodes, baseEdges, { query: "", typeFilter: "all" });
    expect(view.nodes).toBe(baseNodes);
    expect(view.edges).toBe(baseEdges);
    expect(view.matchedNodeIds).toEqual([]);
  });

  it("highlights query-matching nodes and dims others", () => {
    const view = buildGraphPresentation(baseNodes, baseEdges, { query: "rbac", typeFilter: "all" });

    expect(view.matchedNodeIds.sort()).toEqual(["ing-a", "svc-a"]);
    const endpointNode = view.nodes.find((n) => n.id === "ep-a");
    expect(endpointNode?.style?.opacity).toBe(0.22);

    const e1 = view.edges.find((e) => e.id === "e-1");
    expect(e1?.style?.stroke).toBe("#0f766e");
    const e2 = view.edges.find((e) => e.id === "e-2");
    expect(e2?.style?.stroke).toBe("#0f766e");
  });

  it("filters by node type when query is empty", () => {
    const view = buildGraphPresentation(baseNodes, baseEdges, {
      query: "",
      typeFilter: "service",
    });

    expect(view.matchedNodeIds).toEqual(["svc-a"]);
    const ingressNode = view.nodes.find((n) => n.id === "ing-a");
    expect(ingressNode?.style?.opacity).toBe(0.22);

    const e1 = view.edges.find((e) => e.id === "e-1");
    expect(e1?.style?.stroke).toBe("#0f766e");
  });
});

describe("label/time helpers", () => {
  it("returns friendly node type labels", () => {
    expect(nodeTypeLabel("all")).toBe("全部");
    expect(nodeTypeLabel("route")).toBe("Route");
    expect(nodeTypeLabel("istioDestination")).toBe("VS Destination");
  });

  it("formats clock time as HH:mm:ss", () => {
    const ts = new Date("2026-05-07T08:09:03").getTime();
    expect(formatClockTime(ts)).toBe("08:09:03");
  });
});
