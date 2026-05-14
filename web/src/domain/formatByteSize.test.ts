import { describe, expect, it } from "vitest";

import { formatByteSize } from "./formatByteSize";

describe("formatByteSize", () => {
  it("formats tiers", () => {
    expect(formatByteSize(0)).toBe("0 B");
    expect(formatByteSize(500)).toBe("500 B");
    expect(formatByteSize(2048)).toBe("2.0 KB");
    expect(formatByteSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
