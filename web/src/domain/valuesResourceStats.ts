import { parseAllDocuments } from "yaml";

import type { FileTreeNode } from "./fileTreeTypes";

export type ValuesResourceEntry = {
  keyPath: string;
  limitsCpu: string | null;
  limitsMemory: string | null;
  requestsCpu: string | null;
  requestsMemory: string | null;
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

export type ValuesDirectoryStats = {
  directoryPath: string;
  valuesFiles: ValuesFileStats[];
  chart: ChartMeta | null;
  resourceEntryCount: number;
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

function collectResourceEntries(node: unknown, path: string[], out: ValuesResourceEntry[]): void {
  if (Array.isArray(node)) {
    for (const [idx, item] of node.entries()) {
      collectResourceEntries(item, [...path, `[${idx}]`], out);
    }
    return;
  }
  if (!isRecord(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (key === "resources" && isRecord(value)) {
      const limits = isRecord(value.limits) ? value.limits : null;
      const requests = isRecord(value.requests) ? value.requests : null;
      out.push({
        keyPath: toPathString([...path, key]),
        limitsCpu: limits ? normalizeScalar(limits.cpu) : null,
        limitsMemory: limits ? normalizeScalar(limits.memory) : null,
        requestsCpu: requests ? normalizeScalar(requests.cpu) : null,
        requestsMemory: requests ? normalizeScalar(requests.memory) : null,
      });
    }
    collectResourceEntries(value, [...path, key], out);
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
      collectResourceEntries(doc.toJSON(), [], entries);
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
    });
  }

  const summary = directories.reduce(
    (acc, dir) => {
      acc.directoryCount += 1;
      acc.valuesFileCount += dir.valuesFiles.length;
      if (dir.chart) acc.chartCount += 1;
      acc.resourceEntryCount += dir.resourceEntryCount;
      for (const vf of dir.valuesFiles) {
        for (const entry of vf.resourceEntries) {
          if (entry.limitsCpu) acc.limitsCpuCount += 1;
          if (entry.limitsMemory) acc.limitsMemoryCount += 1;
          if (entry.requestsCpu) acc.requestsCpuCount += 1;
          if (entry.requestsMemory) acc.requestsMemoryCount += 1;
        }
      }
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
    },
  );

  return {
    summary,
    directories,
  };
}
