import { describe, expect, it } from "vitest";
import type { Connection, Edge } from "reactflow";

import {
  createEdgeNonce,
  manualEdgeFromConnection,
  mergeComputedEdgesKeepingManual,
  mergeComputedEdgesKeepingManualWithNodeRemap,
  mergeIngressRegionDimensionsFromPrevious,
  reconnectEdgeAsManual,
} from "./diagramPersist";

describe("manualEdgeFromConnection", () => {
  it("creates manual edge with expected style and marker", () => {
    const conn: Connection = { source: "a", target: "b", sourceHandle: "s", targetHandle: "t" };
    const edge = manualEdgeFromConnection(conn);

    expect(edge.id.startsWith("manual-")).toBe(true);
    expect(edge.data?.manual).toBe(true);
    expect(edge.style?.stroke).toBe("#475569");
    expect(edge.style?.strokeDasharray).toBe("6 4");
    expect(edge.markerEnd).toMatchObject({ color: "#475569" });
  });
});

describe("createEdgeNonce", () => {
  it("returns non-empty stable string even without crypto.randomUUID", () => {
    const v = createEdgeNonce();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(8);
  });
});

describe("reconnectEdgeAsManual", () => {
  it("reconnects any edge and converts it to manual edge", () => {
    const autoEdge: Edge = { id: "e-1", source: "ing", target: "svc", type: "smoothstep" };
    const next = reconnectEdgeAsManual(
      autoEdge,
      { source: "ing", target: "ep", sourceHandle: null, targetHandle: null },
      [autoEdge],
    );

    expect(next).toHaveLength(1);
    expect(next[0]!.source).toBe("ing");
    expect(next[0]!.target).toBe("ep");
    expect(next[0]!.data?.manual).toBe(true);
    expect(next[0]!.id.startsWith("manual-")).toBe(true);
  });
});

describe("mergeComputedEdgesKeepingManual", () => {
  it("keeps valid manual edge when it does not duplicate computed edge", () => {
    const prev: Edge[] = [
      manualEdgeFromConnection({
        source: "a",
        target: "b",
        sourceHandle: null,
        targetHandle: null,
      }),
    ];
    const computed: Edge[] = [{ id: "c-1", source: "b", target: "c" }];
    const merged = mergeComputedEdgesKeepingManual(prev, computed, new Set(["a", "b", "c"]));

    expect(merged.map((e) => e.id)).toContain(prev[0]!.id);
    expect(merged).toHaveLength(2);
  });

  it("drops manual edge when computed edge has same connection", () => {
    const manual = manualEdgeFromConnection({
      source: "a",
      target: "b",
      sourceHandle: null,
      targetHandle: null,
    });
    const computed: Edge[] = [{ id: "c-1", source: "a", target: "b" }];
    const merged = mergeComputedEdgesKeepingManual([manual], computed, new Set(["a", "b"]));

    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe("c-1");
  });
});

describe("mergeComputedEdgesKeepingManualWithNodeRemap", () => {
  it("remaps manual edge endpoints when node ids are regenerated", () => {
    const prevNodes = [
      { id: "svc-old", type: "service", data: { nodeKey: "service::p1::ns/svc-a" } },
      { id: "ep-old", type: "endpoints", data: { nodeKey: "endpoints::p1::ns/svc-a" } },
    ] as any[];
    const nextNodes = [
      { id: "svc-new", type: "service", data: { nodeKey: "service::p1::ns/svc-a" } },
      { id: "ep-new", type: "endpoints", data: { nodeKey: "endpoints::p1::ns/svc-a" } },
    ] as any[];

    const manual = manualEdgeFromConnection({
      source: "svc-old",
      target: "ep-old",
      sourceHandle: null,
      targetHandle: null,
    });

    const merged = mergeComputedEdgesKeepingManualWithNodeRemap(
      [manual],
      prevNodes as any,
      [],
      nextNodes as any,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe("svc-new");
    expect(merged[0]!.target).toBe("ep-new");
    expect(merged[0]!.data?.manual).toBe(true);
  });

  it("drops remapped manual edge when computed edge has same connection", () => {
    const prevNodes = [
      { id: "a-old", type: "service", data: { nodeKey: "k-a" } },
      { id: "b-old", type: "service", data: { nodeKey: "k-b" } },
    ] as any[];
    const nextNodes = [
      { id: "a-new", type: "service", data: { nodeKey: "k-a" } },
      { id: "b-new", type: "service", data: { nodeKey: "k-b" } },
    ] as any[];

    const manual = manualEdgeFromConnection({
      source: "a-old",
      target: "b-old",
      sourceHandle: null,
      targetHandle: null,
    });
    const computed = [
      { id: "c-1", source: "a-new", target: "b-new", sourceHandle: null, targetHandle: null },
    ] as any[];

    const merged = mergeComputedEdgesKeepingManualWithNodeRemap(
      [manual],
      prevNodes as any,
      computed as any,
      nextNodes as any,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe("c-1");
  });
});

describe("mergeIngressRegionDimensionsFromPrevious", () => {
  it("keeps larger user-sized region when computed is smaller", () => {
    const prev = [
      {
        id: "r1",
        type: "ingressRegion",
        data: { nodeKey: "region::ing-x" },
        style: { width: 2400, height: 900 },
      },
    ] as any[];
    const computed = [
      {
        id: "r1n",
        type: "ingressRegion",
        data: { nodeKey: "region::ing-x" },
        style: { width: 1200, height: 500 },
      },
    ] as any[];

    const out = mergeIngressRegionDimensionsFromPrevious(prev as any, computed as any);
    expect(out[0]!.style).toMatchObject({ width: 2400, height: 900 });
  });

  it("grows when computed region is larger than previous", () => {
    const prev = [
      {
        id: "r1",
        type: "ingressRegion",
        data: { nodeKey: "region::ing-x" },
        style: { width: 800, height: 400 },
      },
    ] as any[];
    const computed = [
      {
        id: "r1n",
        type: "ingressRegion",
        data: { nodeKey: "region::ing-x" },
        style: { width: 1400, height: 700 },
      },
    ] as any[];

    const out = mergeIngressRegionDimensionsFromPrevious(prev as any, computed as any);
    expect(out[0]!.style).toMatchObject({ width: 1400, height: 700 });
  });
});
