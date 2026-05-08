import { describe, expect, it } from "vitest";
import type { Connection, Edge } from "reactflow";

import {
  createEdgeNonce,
  manualEdgeFromConnection,
  mergeComputedEdgesKeepingManual,
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
    const next = reconnectEdgeAsManual(autoEdge, { source: "ing", target: "ep" }, [autoEdge]);

    expect(next).toHaveLength(1);
    expect(next[0]!.source).toBe("ing");
    expect(next[0]!.target).toBe("ep");
    expect(next[0]!.data?.manual).toBe(true);
    expect(next[0]!.id.startsWith("manual-")).toBe(true);
  });
});

describe("mergeComputedEdgesKeepingManual", () => {
  it("keeps valid manual edge when it does not duplicate computed edge", () => {
    const prev: Edge[] = [manualEdgeFromConnection({ source: "a", target: "b" })];
    const computed: Edge[] = [{ id: "c-1", source: "b", target: "c" }];
    const merged = mergeComputedEdgesKeepingManual(prev, computed, new Set(["a", "b", "c"]));

    expect(merged.map((e) => e.id)).toContain(prev[0]!.id);
    expect(merged).toHaveLength(2);
  });

  it("drops manual edge when computed edge has same connection", () => {
    const manual = manualEdgeFromConnection({ source: "a", target: "b" });
    const computed: Edge[] = [{ id: "c-1", source: "a", target: "b" }];
    const merged = mergeComputedEdgesKeepingManual([manual], computed, new Set(["a", "b"]));

    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe("c-1");
  });
});
