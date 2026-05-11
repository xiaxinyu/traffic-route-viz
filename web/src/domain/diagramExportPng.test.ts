import { describe, expect, it } from "vitest";
import type { Node } from "reactflow";

import { computePngExportFrame } from "./diagramExportPng";

function n(id: string, x: number, y: number, w = 160, h = 100): Node {
  return {
    id,
    position: { x, y },
    width: w,
    height: h,
    data: {},
  };
}

describe("computePngExportFrame", () => {
  it("returns sensible defaults for empty graph", () => {
    const frame = computePngExportFrame([]);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThan(0);
    expect(frame.viewport.zoom).toBe(1);
  });

  it("expands export frame to include distant nodes", () => {
    const frame = computePngExportFrame([n("a", 0, 0), n("b", 2800, 1400)]);
    expect(frame.width).toBeGreaterThan(1000);
    expect(frame.height).toBeGreaterThan(800);
    expect(frame.viewport.zoom).toBeGreaterThan(0);
  });
});
