/**
 * Swimlane hints from import paths (folder/file names). Used by buildGraph layout + partition header.
 * Aligns with Example tier folders when present (01=global ingress layer, 02/03=worker layers).
 */

export type SwimlaneBandKind = "global" | "active01" | "active02" | "gateway";

export type ExampleTierInfo = {
  tierCode: "01" | "02" | "03";
  tierIndex: 1 | 2 | 3;
  effectiveFolderHint: string;
  activeWeight: number;
} | null;

/** Mirrors buildGraph.parseExampleTier — kept here for unit tests without importing buildGraph internals. */
export function parseExampleTierFromFiles(sourceFiles: string[] | undefined): ExampleTierInfo {
  const files = sourceFiles ?? [];
  const pick = files.find(Boolean) ?? "";
  const segs = pick.split("/").filter(Boolean);
  const tierSeg = segs.find((s) => /^(0[1-3])[-_]/.test(s));
  const m = tierSeg?.match(/^(0[1-3])[-_](.+)$/);
  if (!m) return null;
  const tierCode = m[1] as "01" | "02" | "03";
  const tierIndex = (tierCode === "01" ? 1 : tierCode === "02" ? 2 : 3) as 1 | 2 | 3;

  const lower = segs.map((s) => s.toLowerCase());
  const activeWeight = lower.some((s) => s.includes("active01"))
    ? 10
    : lower.some((s) => s.includes("active02"))
      ? 20
      : 50;

  const folderSegs = segs.slice(0, -1).map((s) => s.replace(/^(0[1-3])[-_]/, ""));
  const effectiveFolderHint = folderSegs.join(" / ");
  return { tierCode, tierIndex, effectiveFolderHint, activeWeight };
}

export type SwimlaneInferResult = {
  band: SwimlaneBandKind;
  clusterHint?: string;
  swimlaneLabel: string;
};

export function inferSwimlaneBand(
  sourceFiles: string[] | undefined,
  tier: ExampleTierInfo,
): SwimlaneInferResult {
  const hay = (sourceFiles ?? []).join("/").toLowerCase();

  const clusterFromPath = (): string | undefined => {
    if (hay.includes("active01")) return "Active01";
    if (hay.includes("active02")) return "Active02";
    if (hay.includes("uat")) return "UAT";
    if (hay.includes("sit")) return "SIT";
    if (hay.includes("prd") || hay.includes("prod") || hay.includes("production")) return "PRD";
    return undefined;
  };

  const isGatewayBundle =
    hay.includes("gateway") ||
    hay.includes("istio") ||
    hay.includes("virtualservice") ||
    hay.includes("destinationrule") ||
    hay.includes("httpproxy") ||
    hay.includes("contour");

  if (tier?.tierIndex === 1) {
    return {
      band: "global",
      swimlaneLabel: "Lane: Global",
    };
  }
  if (tier?.tierIndex === 2 || tier?.tierIndex === 3) {
    if (isGatewayBundle) return { band: "gateway", swimlaneLabel: "Lane: Gateway" };
    if (hay.includes("active02")) return { band: "active02", clusterHint: "Active02", swimlaneLabel: "Lane: Active02" };
    return { band: "active01", clusterHint: "Active01", swimlaneLabel: "Lane: Active01" };
  }

  if (
    hay.includes("dce5-global") ||
    hay.includes("stretch") ||
    /(^|[\\/])0?1[-_]/.test(hay) ||
    hay.includes("/global/") ||
    hay.includes("global-ingress")
  ) {
    return { band: "global", swimlaneLabel: "Lane: Global" };
  }

  if (isGatewayBundle) return { band: "gateway", swimlaneLabel: "Lane: Gateway" };
  if (hay.includes("active02")) return { band: "active02", clusterHint: "Active02", swimlaneLabel: "Lane: Active02" };
  const ch = clusterFromPath();
  if (ch === "Active01" || hay.includes("active01")) {
    return { band: "active01", clusterHint: "Active01", swimlaneLabel: "Lane: Active01" };
  }
  // Fallback: default worker lane goes to Active01
  return { band: "active01", swimlaneLabel: "Lane: Active01" };
}
