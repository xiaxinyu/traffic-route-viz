import { describe, expect, it } from "vitest";

import { parsePortalHash } from "./portalHashRoute";

describe("parsePortalHash", () => {
  it("maps legacy local-folder hashes to resource-stats", () => {
    expect(parsePortalHash("#/local-folder")).toBe("resource-stats");
    expect(parsePortalHash("#/folder")).toBe("resource-stats");
  });
});
