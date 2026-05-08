/**
 * Swimlane hints from import paths (folder/file names). Used by buildGraph layout + partition header.
 * Aligns with Example tier folders when present (01=global ingress layer, 02/03=worker layers).
 */

export type SwimlaneBandKind = "global" | "worker" | "default";

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

  if (tier?.tierIndex === 1) {
    return {
      band: "global",
      swimlaneLabel: "泳道：Global（Stretch / 01 入口层）",
    };
  }
  if (tier?.tierIndex === 2 || tier?.tierIndex === 3) {
    const ch = clusterFromPath();
    const tail = ch ? ` · ${ch}` : "";
    return {
      band: "worker",
      clusterHint: ch,
      swimlaneLabel: `泳道：Worker（Level 0${tier.tierIndex}）${tail}`,
    };
  }

  if (
    hay.includes("dce5-global") ||
    hay.includes("stretch") ||
    /(^|[\\/])0?1[-_]/.test(hay) ||
    hay.includes("/global/") ||
    hay.includes("global-ingress")
  ) {
    return { band: "global", swimlaneLabel: "泳道：Global（路径启发）" };
  }

  const ch = clusterFromPath();
  if (
    ch ||
    hay.includes("worker") ||
    hay.includes("active01") ||
    hay.includes("active02") ||
    hay.includes("/uat/")
  ) {
    return {
      band: "worker",
      clusterHint: ch,
      swimlaneLabel: ch ? `泳道：Worker · ${ch}` : "泳道：Worker（路径启发）",
    };
  }

  return { band: "default", swimlaneLabel: "泳道：默认" };
}
