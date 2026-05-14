import { describe, expect, it } from "vitest";

import { formatCpuFromMilli, formatMemoryFromBytes, parseCpuToMilli, parseMemoryToBytes } from "./k8sQuantity";

describe("k8sQuantity", () => {
  it("parses CPU cores and millicores", () => {
    expect(parseCpuToMilli("500m")).toBe(500);
    expect(parseCpuToMilli("2")).toBe(2000);
    expect(parseCpuToMilli("0.5")).toBe(500);
    expect(formatCpuFromMilli(1000)).toBe("1 core");
    expect(formatCpuFromMilli(500)).toBe("0.5 core");
    expect(formatCpuFromMilli(3750)).toBe("3.75 core");
    expect(formatCpuFromMilli(20000)).toBe("20 core");
  });

  it("parses memory Gi/Mi and formats back as Gi", () => {
    expect(parseMemoryToBytes("6Gi")).toBe(6 * 1024 ** 3);
    expect(parseMemoryToBytes("512Mi")).toBe(512 * 1024 ** 2);
    expect(formatMemoryFromBytes(6 * 1024 ** 3)).toBe("6 Gi");
    expect(formatMemoryFromBytes(512 * 1024 ** 2)).toBe("0.5 Gi");
    expect(formatMemoryFromBytes(0)).toBe("0 Gi");
  });
});
