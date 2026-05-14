import { describe, expect, it } from "vitest";

import { pickActiveGitRepoRoot } from "./gitRepoContext";

describe("pickActiveGitRepoRoot", () => {
  it("picks longest matching repo root", () => {
    const roots = ["RTS-ROLLOUT", "RTS-ROLLOUT/master-data", "RTS-ROLLOUT/stock-physical"];
    expect(pickActiveGitRepoRoot(roots, "RTS-ROLLOUT/master-data/active01/Chart.yaml")).toBe(
      "RTS-ROLLOUT/master-data",
    );
    expect(pickActiveGitRepoRoot(roots, "RTS-ROLLOUT/stock-physical/README.md")).toBe(
      "RTS-ROLLOUT/stock-physical",
    );
  });

  it("returns null when no match", () => {
    expect(pickActiveGitRepoRoot(["RTS-ROLLOUT/a"], "RTS-ROLLOUT/b/x.txt")).toBeNull();
  });

  it("returns null when selection is null", () => {
    expect(pickActiveGitRepoRoot(["RTS-ROLLOUT/a"], null)).toBeNull();
  });
});
