import { describe, expect, it } from "vitest";

import { ingressVsPathOverlaps, normalizeUrlPath } from "./istioIngressPathMatch";

describe("normalizeUrlPath", () => {
  it("normalizes slashes, casing, and trailing slashes", () => {
    expect(normalizeUrlPath("/API//v1/")).toBe("/api/v1");
    expect(normalizeUrlPath("/")).toBe("/");
    expect(normalizeUrlPath("")).toBe("*");
    expect(normalizeUrlPath("*")).toBe("*");
  });
});

describe("ingressVsPathOverlaps", () => {
  it("treats wildcard on either side as overlap", () => {
    expect(ingressVsPathOverlaps("*", "Prefix", "/a", "Prefix")).toBe(true);
    expect(ingressVsPathOverlaps("/a", "Prefix", "*", "Prefix")).toBe(true);
    expect(ingressVsPathOverlaps("", "Prefix", "/a", "Prefix")).toBe(true);
  });

  it("supports Exact vs Exact", () => {
    expect(ingressVsPathOverlaps("/a", "Exact", "/a", "Exact")).toBe(true);
    expect(ingressVsPathOverlaps("/a", "Exact", "/b", "Exact")).toBe(false);
  });

  it("supports Prefix vs Prefix intersection", () => {
    expect(ingressVsPathOverlaps("/api", "Prefix", "/api/v1", "Prefix")).toBe(true);
    expect(ingressVsPathOverlaps("/api/v1", "Prefix", "/api", "Prefix")).toBe(true);
    expect(ingressVsPathOverlaps("/a", "Prefix", "/b", "Prefix")).toBe(false);
  });

  it("supports Exact vs Prefix", () => {
    expect(ingressVsPathOverlaps("/api/v1", "Exact", "/api", "Prefix")).toBe(true);
    expect(ingressVsPathOverlaps("/api/v1", "Exact", "/b", "Prefix")).toBe(false);
  });

  it("treats ImplementationSpecific as Prefix (Ingress side)", () => {
    expect(ingressVsPathOverlaps("/api", "ImplementationSpecific", "/api/v2", "Prefix")).toBe(true);
    expect(ingressVsPathOverlaps("/a", "ImplementationSpecific", "/b", "Prefix")).toBe(false);
  });

  it("supports VS Regex overlap against Ingress Exact/Prefix samples", () => {
    expect(ingressVsPathOverlaps("/api", "Prefix", "^/api(/.*)?$", "Regex")).toBe(true);
    expect(ingressVsPathOverlaps("/b", "Prefix", "^/api(/.*)?$", "Regex")).toBe(false);
    expect(ingressVsPathOverlaps("/api", "Exact", "^/api$", "Regex")).toBe(true);
  });

  it("fails closed on invalid regex", () => {
    expect(ingressVsPathOverlaps("/api", "Prefix", "([", "Regex")).toBe(false);
  });
});
