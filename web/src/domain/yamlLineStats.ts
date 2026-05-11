import type { ImportedYamlFile } from "./mergeYamlBundles";
import { mergeYamlFiles } from "./mergeYamlBundles";

/** CRLF → LF，与 YAML 编辑区统计一致。 */
export function normalizeYamlNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * 按换行符分段计数，空串为 0 行；与 `buildYamlTextStats` 行数口径一致（含空行）。
 */
export function countYamlTextLines(text: string): number {
  const n = normalizeYamlNewlines(text);
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
