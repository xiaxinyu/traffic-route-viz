/** Shallow stable JSON for annotations / small spec fragments (no deep sort). */
export function shallowStableJsonRecord(v: unknown): string {
  if (v === null || v === undefined) return JSON.stringify(v);
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = o[k];
  return JSON.stringify(sorted);
}
