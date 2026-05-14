import { describe, expect, it } from "vitest";

import { inferFileCategoryLabel } from "./fileSummary";

describe("inferFileCategoryLabel", () => {
  it("maps common extensions", () => {
    expect(inferFileCategoryLabel("a.yaml")).toBe("YAML");
    expect(inferFileCategoryLabel("b.JSON")).toBe("JSON");
    expect(inferFileCategoryLabel("x.ts")).toBe("TypeScript");
  });
});
