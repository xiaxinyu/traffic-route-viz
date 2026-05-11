import type { ImportedYamlFile } from "./mergeYamlBundles";
import { mergeYamlFiles } from "./mergeYamlBundles";

/** CRLF → LF，与 YAML 编辑区统计一致。 */
export function normalizeYamlNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i += 1; // " "
  return i;
}

function yamlKeyOf(lineTrimmed: string): string | null {
  if (!lineTrimmed || lineTrimmed.startsWith("#") || lineTrimmed.startsWith("- ")) return null;
  const idx = lineTrimmed.indexOf(":");
  if (idx <= 0) return null;
  return lineTrimmed.slice(0, idx).trim();
}

/**
 * Remove noisy k8s metadata fields from *display* YAML:
 * - metadata.annotations.kubectl.kubernetes.io/last-applied-configuration
 * - metadata.creationTimestamp / generation / resourceVersion / uid
 *
 * Keeps original formatting for other lines (line-based removal, no re-serialization).
 */
export function stripK8sMetadataNoise(text: string): string {
  const normalized = normalizeYamlNewlines(text);
  if (!normalized) return normalized;
  const lines = normalized.split("\n");
  const out: string[] = [];

  const metaKeys = new Set(["creationTimestamp", "generation", "resourceVersion", "uid"]);
  const lastAppliedKey = "kubectl.kubernetes.io/last-applied-configuration";

  let metaIndent: number | null = null;
  let annoIndent: number | null = null;
  let skipIndent: number | null = null;

  for (const line of lines) {
    const indent = leadingSpaces(line);
    const trimmed = line.slice(indent);

    // Continue skipping a block scalar / nested value
    if (skipIndent !== null) {
      if (trimmed.trim() === "") continue;
      if (indent > skipIndent) continue;
      skipIndent = null;
    }

    // Track exit from annotations / metadata blocks
    if (annoIndent !== null) {
      if (trimmed.trim() !== "" && indent <= annoIndent) annoIndent = null;
    }
    if (metaIndent !== null) {
      if (trimmed.trim() !== "" && indent <= metaIndent) {
        metaIndent = null;
        annoIndent = null;
      }
    }

    const key = yamlKeyOf(trimmed);

    // Enter metadata block
    if (metaIndent === null && key === "metadata") {
      metaIndent = indent;
      out.push(line);
      continue;
    }

    // Inside metadata
    if (metaIndent !== null) {
      // Enter annotations block
      if (annoIndent === null && key === "annotations" && indent === metaIndent + 2) {
        annoIndent = indent;
        out.push(line);
        continue;
      }

      // Remove top-level metadata noise keys
      if (key && indent === metaIndent + 2 && metaKeys.has(key)) {
        continue;
      }

      // Inside annotations: remove kubectl last-applied blob (including block scalar)
      if (annoIndent !== null && key === lastAppliedKey && indent === annoIndent + 2) {
        skipIndent = indent;
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

/**
 * 按换行符分段计数，空串为 0 行；与 `buildYamlTextStats` 行数口径一致（含空行）。
 */
export function countYamlTextLines(text: string): number {
  const n = stripK8sMetadataNoise(text);
  return n ? n.split("\n").length : 0;
}

export type ImportedYamlFileLineRow = {
  displayPath: string;
  lineCount: number;
};

export type ImportedYamlLinesSummary = {
  perFile: ImportedYamlFileLineRow[];
  /** 各文件 `text` 行数相加 */
  sumOfFileLines: number;
  /** `mergeYamlFiles` 结果的行数 */
  mergedLineCount: number;
};

export function summarizeImportedYamlLines(files: ImportedYamlFile[]): ImportedYamlLinesSummary {
  const perFile = files.map((f) => ({
    displayPath: f.relPath ?? f.name,
    lineCount: countYamlTextLines(f.text),
  }));
  const sumOfFileLines = perFile.reduce((acc, r) => acc + r.lineCount, 0);
  const mergedText = mergeYamlFiles(files);
  return {
    perFile,
    sumOfFileLines,
    mergedLineCount: countYamlTextLines(mergedText),
  };
}
