/**
 * Decide whether an Ingress HTTP path rule and an Istio VirtualService URI match rule
 * may both accept **some** concrete request path (non-empty semantic intersection).
 */

export type ParsedPathKind = "Prefix" | "Exact" | "Regex" | "ImplementationSpecific";

/** Normalize slash semantics (lowercase, collapse //, strip trailing slashes except `/`). */
export function normalizeUrlPath(raw: string): string {
  let s = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\/{2,}/g, "/");
  if (!s) return "*";
  if (s === "*") return "*";
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
}

function isWildcardPath(p: string): boolean {
  const n = normalizeUrlPath(p);
  return n === "*" || n === "." || !n.trim();
}

function ingressKindToParsed(kind?: string): ParsedPathKind {
  const k = (kind ?? "").toLowerCase();
  if (k === "exact") return "Exact";
  if (k === "implementationspecific") return "ImplementationSpecific";
  return "Prefix";
}

function vsKindToParsed(kind?: string): ParsedPathKind {
  const k = (kind ?? "").toLowerCase();
  if (k === "exact") return "Exact";
  if (k === "regex") return "Regex";
  if (k === "prefix") return "Prefix";
  return "Prefix";
}

/** `prefix` is a URL path prefix of `full` (K8s Prefix semantics, rough). */
function pathPrefixAccepts(prefixNorm: string, fullNorm: string): boolean {
  if (prefixNorm === "*") return true;
  if (fullNorm === "*") return true;
  if (prefixNorm === "/") return true;
  return fullNorm === prefixNorm || fullNorm.startsWith(`${prefixNorm}/`);
}

/** Sample strings that an Ingress Prefix rule can accept (for regex intersection). */
function ingressPrefixSamplePaths(prefixRaw: string): string[] {
  const p = normalizeUrlPath(prefixRaw);
  if (p === "*") return ["*"];
  if (p === "/") return ["/", "/x"];
  return [p, `${p}/x`];
}

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

/**
 * True if some URL path can satisfy both rules (conservative heuristics for Regex / ImplementationSpecific).
 */
export function ingressVsPathOverlaps(
  ingressPath: string,
  ingressPathType: string | undefined,
  vsPath: string,
  vsPathType: string | undefined,
): boolean {
  // Istio omit-match / "*" URI → matches any path; Ingress missing path defaults to "/" elsewhere.
  if (isWildcardPath(vsPath)) return true;
  if (isWildcardPath(ingressPath)) return true;

  const ik = ingressKindToParsed(ingressPathType);
  const vk = vsKindToParsed(vsPathType);

  const iNorm = normalizeUrlPath(ingressPath);
  const vNorm = normalizeUrlPath(vsPath);

  const iMode: ParsedPathKind = ik === "ImplementationSpecific" ? "Prefix" : ik;
  const vMode: ParsedPathKind = vk;

  // --- VS Regex ---
  if (vMode === "Regex") {
    const re = safeRegex(vsPath.trim());
    if (!re) return false;
    if (iMode === "Exact") return re.test(iNorm);
    if (iMode === "Prefix") {
      return ingressPrefixSamplePaths(ingressPath).some((s) => s !== "*" && re.test(s));
    }
    return false;
  }

  // --- VS Exact ---
  if (vMode === "Exact") {
    if (iMode === "Exact") return iNorm === vNorm;
    if (iMode === "Prefix") return pathPrefixAccepts(iNorm, vNorm);
    return false;
  }

  // --- VS Prefix (default) ---
  if (vMode === "Prefix") {
    if (iMode === "Exact") return pathPrefixAccepts(vNorm, iNorm);
    if (iMode === "Prefix") {
      // Non-empty intersection of two prefix languages: one extends the other on the left.
      return pathPrefixAccepts(vNorm, iNorm) || pathPrefixAccepts(iNorm, vNorm);
    }
  }

  return false;
}
