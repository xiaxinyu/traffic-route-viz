import { parseAllDocuments } from "yaml";

import { parseCpuToMilli, parseMemoryToBytes } from "./k8sQuantity";
import type { FileTreeNode } from "./fileTreeTypes";

export type ValuesResourceEntry = {
  keyPath: string;
  limitsCpu: string | null;
  limitsMemory: string | null;
  requestsCpu: string | null;
  requestsMemory: string | null;
  /** 自父级链上就近解析的 replicaCount / replicas；未写则为 1 */
  replicas: number;
};

export type ValuesFileStats = {
  relativePath: string;
  resourceEntries: ValuesResourceEntry[];
  parseError: string | null;
};

export type ChartDependencyMeta = {
  name: string;
  version: string | null;
  repository: string | null;
};

export type ChartMeta = {
  chartName: string | null;
  chartVersion: string | null;
  appVersion: string | null;
  dependencies: ChartDependencyMeta[];
  parseError: string | null;
  relativePath: string;
};

export type ValuesDirectoryStanzaSummary = {
  requestsCpuCount: number;
  /** 去重后的原始标量，保留 YAML 中单位（如 500m、6Gi） */
  requestsCpuValues: string[];
  limitsCpuCount: number;
  limitsCpuValues: string[];
  requestsMemoryCount: number;
  requestsMemoryValues: string[];
  limitsMemoryCount: number;
  limitsMemoryValues: string[];
  /** 各 resources 块就近副本数加权后的合计（可解析的标量才计入） */
  weightedRequestsCpuMillisTotal: number;
  weightedLimitsCpuMillisTotal: number;
  weightedRequestsMemoryBytesTotal: number;
  weightedLimitsMemoryBytesTotal: number;
  weightedHasRequestsCpu: boolean;
  weightedHasLimitsCpu: boolean;
  weightedHasRequestsMemory: boolean;
  weightedHasLimitsMemory: boolean;
  /** 存在无法解析为数值的 cpu/memory 标量时置 true */
  weightedPartial: boolean;
};

export type ValuesDirectoryStats = {
  directoryPath: string;
  valuesFiles: ValuesFileStats[];
  chart: ChartMeta | null;
  resourceEntryCount: number;
  /** resources 块出现次数（聚合后用于展示，不逐条罗列 workload） */
  stanzaSummary: ValuesDirectoryStanzaSummary;
};

export type ValuesResourceStats = {
  summary: {
    directoryCount: number;
    valuesFileCount: number;
    chartCount: number;
    resourceEntryCount: number;
    limitsCpuCount: number;
    limitsMemoryCount: number;
    requestsCpuCount: number;
    requestsMemoryCount: number;
    weightedRequestsCpuMillisTotal: number;
    weightedLimitsCpuMillisTotal: number;
    weightedRequestsMemoryBytesTotal: number;
    weightedLimitsMemoryBytesTotal: number;
    weightedHasRequestsCpu: boolean;
    weightedHasLimitsCpu: boolean;
    weightedHasRequestsMemory: boolean;
    weightedHasLimitsMemory: boolean;
    weightedPartial: boolean;
  };
  directories: ValuesDirectoryStats[];
};

type DirectoryCandidate = {
  valuesFiles: Array<{ relativePath: string; file: File }>;
  chartFile: { relativePath: string; file: File } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeScalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function toPathString(path: string[]): string {
  if (path.length === 0) return "resources";
  return path.join(".");
}

function normalizeReplicaScalar(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.min(Math.floor(value), 1_000_000);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(Math.floor(n), 1_000_000);
  }
  return null;
}

function readReplicasFromRecord(rec: Record<string, unknown>): number | null {
  for (const key of ["replicaCount", "replicas"] as const) {
    const n = normalizeReplicaScalar(rec[key]);
    if (n != null) return n;
  }
  return null;
}

/** 自内向外在祖先对象上查找 replicaCount / replicas；未写则 1 */
function resolveReplicasForResourceContext(chain: Record<string, unknown>[]): number {
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = readReplicasFromRecord(chain[i]!);
    if (n != null) return n;
  }
  return 1;
}

function collectResourceEntries(
  node: unknown,
  path: string[],
  ancestorRecords: Record<string, unknown>[],
  out: ValuesResourceEntry[],
): void {
  if (Array.isArray(node)) {
    for (const [idx, item] of node.entries()) {
      collectResourceEntries(item, [...path, `[${idx}]`], ancestorRecords, out);
    }
    return;
  }
  if (!isRecord(node)) return;

  const chain = [...ancestorRecords, node];

  for (const [key, value] of Object.entries(node)) {
    if (key === "resources" && isRecord(value)) {
      const limits = isRecord(value.limits) ? value.limits : null;
      const requests = isRecord(value.requests) ? value.requests : null;
      const replicas = resolveReplicasForResourceContext(chain);
      out.push({
        keyPath: toPathString([...path, key]),
        limitsCpu: limits ? normalizeScalar(limits.cpu) : null,
        limitsMemory: limits ? normalizeScalar(limits.memory) : null,
        requestsCpu: requests ? normalizeScalar(requests.cpu) : null,
        requestsMemory: requests ? normalizeScalar(requests.memory) : null,
        replicas,
      });
    }
    collectResourceEntries(value, [...path, key], chain, out);
  }
}

function isValuesFileName(name: string): boolean {
  return /^values(?:[._-][^.]+)?\.ya?ml$/i.test(name);
}

function isChartFileName(name: string): boolean {
  return /^chart\.ya?ml$/i.test(name);
}

function dirname(relativePath: string): string {
  const idx = relativePath.lastIndexOf("/");
  if (idx <= 0) return ".";
  return relativePath.slice(0, idx);
}

function collectCandidates(root: FileTreeNode): Map<string, DirectoryCandidate> {
  const byDir = new Map<string, DirectoryCandidate>();

  const walk = (node: FileTreeNode): void => {
    if (node.file) {
      const fileName = node.name;
      if (!isValuesFileName(fileName) && !isChartFileName(fileName)) {
        return;
      }
      const dirPath = dirname(node.relativePath);
      const found = byDir.get(dirPath) ?? { valuesFiles: [], chartFile: null };
      if (isValuesFileName(fileName)) {
        found.valuesFiles.push({ relativePath: node.relativePath, file: node.file });
      } else if (!found.chartFile || node.relativePath.localeCompare(found.chartFile.relativePath) < 0) {
        found.chartFile = { relativePath: node.relativePath, file: node.file };
      }
      byDir.set(dirPath, found);
      return;
    }
    if (!node.children) return;
    for (const child of node.children) walk(child);
  };

  walk(root);

  for (const [dirPath, candidate] of byDir.entries()) {
    if (candidate.valuesFiles.length === 0) {
      byDir.delete(dirPath);
      continue;
    }
    candidate.valuesFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  return byDir;
}

function parseChartMeta(relativePath: string, text: string): ChartMeta {
  try {
    const docs = parseAllDocuments(text);
    const first = docs.map((d) => d.toJSON()).find((v) => isRecord(v));
    if (!first || !isRecord(first)) {
      return {
        chartName: null,
        chartVersion: null,
        appVersion: null,
        dependencies: [],
        parseError: null,
        relativePath,
      };
    }

    const depsRaw = Array.isArray(first.dependencies) ? first.dependencies : [];
    const dependencies: ChartDependencyMeta[] = depsRaw
      .filter((dep) => isRecord(dep))
      .map((dep) => ({
        name: normalizeScalar(dep.name) ?? "(unnamed)",
        version: normalizeScalar(dep.version),
        repository: normalizeScalar(dep.repository),
      }));

    return {
      chartName: normalizeScalar(first.name),
      chartVersion: normalizeScalar(first.version),
      appVersion: normalizeScalar(first.appVersion),
      dependencies,
      parseError: null,
      relativePath,
    };
  } catch (error) {
    return {
      chartName: null,
      chartVersion: null,
      appVersion: null,
      dependencies: [],
      parseError: error instanceof Error ? error.message : "Chart.yaml 解析失败",
      relativePath,
    };
  }
}

function parseValuesFile(relativePath: string, text: string): ValuesFileStats {
  try {
    const docs = parseAllDocuments(text);
    const entries: ValuesResourceEntry[] = [];
    for (const doc of docs) {
      collectResourceEntries(doc.toJSON(), [], [], entries);
    }
    return {
      relativePath,
      resourceEntries: entries,
      parseError: null,
    };
  } catch (error) {
    return {
      relativePath,
      resourceEntries: [],
      parseError: error instanceof Error ? error.message : "values 文件解析失败",
    };
  }
}

const AGGREGATION_ANCHORS = new Set(["master-data", "stock-physical"]);

function pushUniqueScalar(list: string[], raw: string | null): void {
  if (raw == null) return;
  const v = String(raw).trim();
  if (!v || list.includes(v)) return;
  list.push(v);
}

function effectiveReplicas(entry: ValuesResourceEntry): number {
  const r = entry.replicas;
  if (!Number.isFinite(r) || r < 0) return 1;
  return Math.min(Math.floor(r), 1_000_000);
}

function computeStanzaSummary(valuesFiles: ValuesFileStats[]): ValuesDirectoryStanzaSummary {
  const out: ValuesDirectoryStanzaSummary = {
    requestsCpuCount: 0,
    requestsCpuValues: [],
    limitsCpuCount: 0,
    limitsCpuValues: [],
    requestsMemoryCount: 0,
    requestsMemoryValues: [],
    limitsMemoryCount: 0,
    limitsMemoryValues: [],
    weightedRequestsCpuMillisTotal: 0,
    weightedLimitsCpuMillisTotal: 0,
    weightedRequestsMemoryBytesTotal: 0,
    weightedLimitsMemoryBytesTotal: 0,
    weightedHasRequestsCpu: false,
    weightedHasLimitsCpu: false,
    weightedHasRequestsMemory: false,
    weightedHasLimitsMemory: false,
    weightedPartial: false,
  };

  for (const vf of valuesFiles) {
    for (const e of vf.resourceEntries) {
      const rep = effectiveReplicas(e);

      if (e.requestsCpu) {
        out.requestsCpuCount += 1;
        pushUniqueScalar(out.requestsCpuValues, e.requestsCpu);
        const millis = parseCpuToMilli(e.requestsCpu);
        if (millis != null) {
          out.weightedRequestsCpuMillisTotal += millis * rep;
          out.weightedHasRequestsCpu = true;
        } else {
          out.weightedPartial = true;
        }
      }
      if (e.limitsCpu) {
        out.limitsCpuCount += 1;
        pushUniqueScalar(out.limitsCpuValues, e.limitsCpu);
        const millis = parseCpuToMilli(e.limitsCpu);
        if (millis != null) {
          out.weightedLimitsCpuMillisTotal += millis * rep;
          out.weightedHasLimitsCpu = true;
        } else {
          out.weightedPartial = true;
        }
      }
      if (e.requestsMemory) {
        out.requestsMemoryCount += 1;
        pushUniqueScalar(out.requestsMemoryValues, e.requestsMemory);
        const bytes = parseMemoryToBytes(e.requestsMemory);
        if (bytes != null) {
          out.weightedRequestsMemoryBytesTotal += bytes * rep;
          out.weightedHasRequestsMemory = true;
        } else {
          out.weightedPartial = true;
        }
      }
      if (e.limitsMemory) {
        out.limitsMemoryCount += 1;
        pushUniqueScalar(out.limitsMemoryValues, e.limitsMemory);
        const bytes = parseMemoryToBytes(e.limitsMemory);
        if (bytes != null) {
          out.weightedLimitsMemoryBytesTotal += bytes * rep;
          out.weightedHasLimitsMemory = true;
        } else {
          out.weightedPartial = true;
        }
      }
    }
  }
  return out;
}

/** 将 `.../master-data/<env>/...` 或 `.../stock-physical/<env>/...` 归并到二级子目录键。 */
export function aggregationBucketForValuesDir(directoryPath: string): string {
  const norm = directoryPath.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    if (AGGREGATION_ANCHORS.has(seg.toLowerCase())) {
      if (i + 1 < parts.length) {
        return parts.slice(0, i + 2).join("/");
      }
      return parts.slice(0, i + 1).join("/");
    }
  }
  return norm;
}

/** UI/排序：路径所属「锚」；0 = master-data，1 = stock-physical，2 = 其它。 */
export function helmAnchorTierForPath(path: string): number {
  for (const seg of path.replace(/\\/g, "/").split("/").filter(Boolean)) {
    const s = seg.toLowerCase();
    if (s === "master-data") return 0;
    if (s === "stock-physical") return 1;
  }
  return 2;
}

function compareValuesDirectoriesByHelmAnchor(a: ValuesDirectoryStats, b: ValuesDirectoryStats): number {
  const ta = helmAnchorTierForPath(a.directoryPath);
  const tb = helmAnchorTierForPath(b.directoryPath);
  if (ta !== tb) return ta - tb;
  return a.directoryPath.localeCompare(b.directoryPath);
}

function mergeUniqueStringLists(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const x of b) {
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

function sumStanza(a: ValuesDirectoryStanzaSummary, b: ValuesDirectoryStanzaSummary): ValuesDirectoryStanzaSummary {
  return {
    requestsCpuCount: a.requestsCpuCount + b.requestsCpuCount,
    requestsCpuValues: mergeUniqueStringLists(a.requestsCpuValues, b.requestsCpuValues),
    limitsCpuCount: a.limitsCpuCount + b.limitsCpuCount,
    limitsCpuValues: mergeUniqueStringLists(a.limitsCpuValues, b.limitsCpuValues),
    requestsMemoryCount: a.requestsMemoryCount + b.requestsMemoryCount,
    requestsMemoryValues: mergeUniqueStringLists(a.requestsMemoryValues, b.requestsMemoryValues),
    limitsMemoryCount: a.limitsMemoryCount + b.limitsMemoryCount,
    limitsMemoryValues: mergeUniqueStringLists(a.limitsMemoryValues, b.limitsMemoryValues),
    weightedRequestsCpuMillisTotal: a.weightedRequestsCpuMillisTotal + b.weightedRequestsCpuMillisTotal,
    weightedLimitsCpuMillisTotal: a.weightedLimitsCpuMillisTotal + b.weightedLimitsCpuMillisTotal,
    weightedRequestsMemoryBytesTotal: a.weightedRequestsMemoryBytesTotal + b.weightedRequestsMemoryBytesTotal,
    weightedLimitsMemoryBytesTotal: a.weightedLimitsMemoryBytesTotal + b.weightedLimitsMemoryBytesTotal,
    weightedHasRequestsCpu: a.weightedHasRequestsCpu || b.weightedHasRequestsCpu,
    weightedHasLimitsCpu: a.weightedHasLimitsCpu || b.weightedHasLimitsCpu,
    weightedHasRequestsMemory: a.weightedHasRequestsMemory || b.weightedHasRequestsMemory,
    weightedHasLimitsMemory: a.weightedHasLimitsMemory || b.weightedHasLimitsMemory,
    weightedPartial: a.weightedPartial || b.weightedPartial,
  };
}

function preferChart(a: ChartMeta | null, b: ChartMeta | null): ChartMeta | null {
  if (!a) return b;
  if (!b) return a;
  if (a.relativePath.length !== b.relativePath.length) {
    return a.relativePath.length <= b.relativePath.length ? a : b;
  }
  return a.relativePath.localeCompare(b.relativePath) <= 0 ? a : b;
}

function dedupeValuesFilesByPath(files: ValuesFileStats[]): ValuesFileStats[] {
  const seen = new Set<string>();
  const out: ValuesFileStats[] = [];
  for (const f of files) {
    if (seen.has(f.relativePath)) continue;
    seen.add(f.relativePath);
    out.push(f);
  }
  return out;
}

function mergeAggregatedDirectories(rows: ValuesDirectoryStats[]): ValuesDirectoryStats[] {
  const map = new Map<string, ValuesDirectoryStats>();

  for (const row of rows) {
    const key = aggregationBucketForValuesDir(row.directoryPath);
    const next: ValuesDirectoryStats = {
      directoryPath: key,
      valuesFiles: row.valuesFiles.map((vf) => ({ ...vf, resourceEntries: [] })),
      chart: row.chart,
      resourceEntryCount: row.resourceEntryCount,
      stanzaSummary: row.stanzaSummary,
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, next);
      continue;
    }

    existing.valuesFiles.push(...next.valuesFiles);
    existing.valuesFiles = dedupeValuesFilesByPath(existing.valuesFiles);
    existing.resourceEntryCount += row.resourceEntryCount;
    existing.stanzaSummary = sumStanza(existing.stanzaSummary, row.stanzaSummary);
    existing.chart = preferChart(existing.chart, row.chart);
  }

  return [...map.values()];
}

function summaryFromDirectories(dirs: ValuesDirectoryStats[]): ValuesResourceStats["summary"] {
  return dirs.reduce(
    (acc, dir) => {
      acc.directoryCount += 1;
      acc.valuesFileCount += dir.valuesFiles.length;
      if (dir.chart) acc.chartCount += 1;
      acc.resourceEntryCount += dir.resourceEntryCount;
      acc.limitsCpuCount += dir.stanzaSummary.limitsCpuCount;
      acc.limitsMemoryCount += dir.stanzaSummary.limitsMemoryCount;
      acc.requestsCpuCount += dir.stanzaSummary.requestsCpuCount;
      acc.requestsMemoryCount += dir.stanzaSummary.requestsMemoryCount;
      acc.weightedRequestsCpuMillisTotal += dir.stanzaSummary.weightedRequestsCpuMillisTotal;
      acc.weightedLimitsCpuMillisTotal += dir.stanzaSummary.weightedLimitsCpuMillisTotal;
      acc.weightedRequestsMemoryBytesTotal += dir.stanzaSummary.weightedRequestsMemoryBytesTotal;
      acc.weightedLimitsMemoryBytesTotal += dir.stanzaSummary.weightedLimitsMemoryBytesTotal;
      acc.weightedHasRequestsCpu ||= dir.stanzaSummary.weightedHasRequestsCpu;
      acc.weightedHasLimitsCpu ||= dir.stanzaSummary.weightedHasLimitsCpu;
      acc.weightedHasRequestsMemory ||= dir.stanzaSummary.weightedHasRequestsMemory;
      acc.weightedHasLimitsMemory ||= dir.stanzaSummary.weightedHasLimitsMemory;
      acc.weightedPartial ||= dir.stanzaSummary.weightedPartial;
      return acc;
    },
    {
      directoryCount: 0,
      valuesFileCount: 0,
      chartCount: 0,
      resourceEntryCount: 0,
      limitsCpuCount: 0,
      limitsMemoryCount: 0,
      requestsCpuCount: 0,
      requestsMemoryCount: 0,
      weightedRequestsCpuMillisTotal: 0,
      weightedLimitsCpuMillisTotal: 0,
      weightedRequestsMemoryBytesTotal: 0,
      weightedLimitsMemoryBytesTotal: 0,
      weightedHasRequestsCpu: false,
      weightedHasLimitsCpu: false,
      weightedHasRequestsMemory: false,
      weightedHasLimitsMemory: false,
      weightedPartial: false,
    },
  );
}

export async function buildValuesResourceStats(root: FileTreeNode): Promise<ValuesResourceStats> {
  const candidates = collectCandidates(root);
  const directories: ValuesDirectoryStats[] = [];

  for (const [directoryPath, candidate] of [...candidates.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const valuesFiles = await Promise.all(
      candidate.valuesFiles.map(async ({ relativePath, file }) => parseValuesFile(relativePath, await file.text())),
    );

    const chart = candidate.chartFile
      ? parseChartMeta(candidate.chartFile.relativePath, await candidate.chartFile.file.text())
      : null;

    directories.push({
      directoryPath,
      valuesFiles,
      chart,
      resourceEntryCount: valuesFiles.reduce((sum, item) => sum + item.resourceEntries.length, 0),
      stanzaSummary: computeStanzaSummary(valuesFiles),
    });
  }

  const directoriesMerged = mergeAggregatedDirectories(directories);
  directoriesMerged.sort(compareValuesDirectoriesByHelmAnchor);
  const summary = summaryFromDirectories(directoriesMerged);

  return {
    summary,
    directories: directoriesMerged,
  };
}
