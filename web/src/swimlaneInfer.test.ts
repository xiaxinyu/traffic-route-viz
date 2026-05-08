import { describe, expect, it } from "vitest";

import { inferSwimlaneBand, parseExampleTierFromFiles } from "./swimlaneInfer";

describe("inferSwimlaneBand", () => {
  it("treats Example 01 tier as global band", () => {
    const files = ["01-dce5-global/edge/ing.yaml"];
    const r = inferSwimlaneBand(files, parseExampleTierFromFiles(files));
    expect(r.band).toBe("global");
    expect(r.swimlaneLabel).toContain("Global");
  });

  it("treats Example 03 + active01 path as worker with cluster hint", () => {
    const files = ["03-dce5-active01/istio/vs.yaml"];
    const r = inferSwimlaneBand(files, parseExampleTierFromFiles(files));
    expect(r.band).toBe("worker");
    expect(r.clusterHint).toBe("Active01");
  });

  it("uses path heuristics when no Example tier", () => {
    const r = inferSwimlaneBand(["clusters/uat/istio/vs.yaml"], null);
    expect(r.band).toBe("worker");
    expect(r.clusterHint).toBe("UAT");
  });
});
