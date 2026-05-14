/** Minimal Kubernetes-style quantity parsing for Helm values stats. */

/** 去掉末尾无意义的小数位，避免 3.7500 */
function trimFixedDecimal(n: number, maxFrac: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(Math.trunc(n));
  const s = n.toFixed(maxFrac).replace(/\.?0+$/, "");
  return s.length > 0 ? s : "0";
}

export function parseCpuToMilli(raw: string): number | null {
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    return Number(s) * 1000;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Math.round(Number(s) * 1000);
  }
  const m = /^(\d+)m$/i.exec(s);
  if (m) return Number(m[1]);
  const mf = /^(\d+\.\d+)m$/i.exec(s);
  if (mf) return Math.round(Number(mf[1]));
  return null;
}

/** 展示用：1000m = 1 core，统一为 core */
export function formatCpuFromMilli(millis: number): string {
  if (!Number.isFinite(millis) || millis <= 0) return "0 core";
  const cores = millis / 1000;
  const rounded = Math.round(cores * 1_000_000) / 1_000_000;
  return `${trimFixedDecimal(rounded, 4)} core`;
}

const memSuffixToBytes: Record<string, number> = {
  // binary (Kubernetes resource.Quantity)
  ki: 1024,
  mi: 1024 ** 2,
  gi: 1024 ** 3,
  ti: 1024 ** 4,
  pi: 1024 ** 5,
  ei: 1024 ** 6,
  // decimal SI
  k: 1000,
  m: 1000 ** 2,
  g: 1000 ** 3,
  t: 1000 ** 4,
  p: 1000 ** 5,
  e: 1000 ** 6,
};

export function parseMemoryToBytes(raw: string): number | null {
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d+)(\.\d+)?([kmgtpe]i|[kmgtpe])$/i.exec(s);
  if (!m) return null;
  const base = Number(m[1] + (m[2] ?? ""));
  if (!Number.isFinite(base)) return null;
  const suf = m[3]!.toLowerCase();
  const mult = memSuffixToBytes[suf];
  if (mult == null) return null;
  return Math.round(base * mult);
}

/** 展示用：统一为 Gi（1024Mi = 1Gi，与 Kubernetes 二进制一致） */
export function formatMemoryFromBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Gi";
  const gib = bytes / 1024 ** 3;
  const rounded = Math.round(gib * 1_000_000) / 1_000_000;
  return `${trimFixedDecimal(rounded, 4)} Gi`;
}
