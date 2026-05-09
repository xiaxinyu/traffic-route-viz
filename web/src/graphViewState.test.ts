import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";

import {
  buildGraphMetrics,
  buildGraphPresentation,
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
