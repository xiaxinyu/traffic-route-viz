import { describe, expect, it } from "vitest";

import type { ImportedYamlFile } from "./mergeYamlBundles";
import { mergeYamlFiles } from "./mergeYamlBundles";
import { countYamlTextLines, summarizeImportedYamlLines } from "./yamlLineStats";

describe("countYamlTextLines", () => {
  it("matches split-on-newline semantics including trailing line without final newline", () => {
    expect(countYamlTextLines("a\nb")).toBe(2);
    expect(countYamlTextLines("a\nb\n")).toBe(3);
    expect(countYamlTextLines("")).toBe(0);
  });

  it("normalizes CRLF", () => {
    expect(countYamlTextLines("a\r\nb")).toBe(2);
  });
});

describe("summarizeImportedYamlLines", () => {
  it("aggregates per-file, sum, and merged counts", () => {
    const files: ImportedYamlFile[] = [
      { name: "a.yaml", text: "x\ny\n" },
      { name: "b.yaml", text: "z" },
    ];
    const s = summarizeImportedYamlLines(files);
    expect(s.perFile).toEqual([
      { displayPath: "a.yaml", lineCount: 3 },
      { displayPath: "b.yaml", lineCount: 1 },
    ]);
    expect(s.sumOfFileLines).toBe(4);
    const merged = mergeYamlFiles(files);
    expect(s.mergedLineCount).toBe(countYamlTextLines(merged));
    expect(merged).toContain("---");
  });

  it("uses relPath for display when set", () => {
    const files: ImportedYamlFile[] = [{ name: "x.yaml", relPath: "dir/x.yaml", text: "a\n" }];
    expect(summarizeImportedYamlLines(files).perFile[0]!.displayPath).toBe("dir/x.yaml");
  });
});
