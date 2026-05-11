import { describe, expect, it } from "vitest";

import type { ImportedYamlFile } from "./mergeYamlBundles";
import { mergeYamlFiles } from "./mergeYamlBundles";
import { countYamlTextLines, stripK8sMetadataNoise, summarizeImportedYamlLines } from "./yamlLineStats";

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

describe("stripK8sMetadataNoise", () => {
  it("removes metadata noise keys and kubectl last-applied annotation", () => {
    const raw = [
      "apiVersion: v1",
      "kind: Service",
      "metadata:",
      "  name: x",
      "  creationTimestamp: 2020-01-01T00:00:00Z",
      "  generation: 3",
      "  resourceVersion: \"123\"",
      "  uid: abc",
      "  annotations:",
      "    foo: bar",
      "    kubectl.kubernetes.io/last-applied-configuration: |",
      "      {\"a\":1}",
      "      {\"b\":2}",
      "spec:",
      "  ports: []",
      "",
    ].join("\n");
    const stripped = stripK8sMetadataNoise(raw);
    expect(stripped).toContain("metadata:");
    expect(stripped).toContain("annotations:");
    expect(stripped).toContain("    foo: bar");
    expect(stripped).not.toContain("creationTimestamp");
    expect(stripped).not.toContain("resourceVersion");
    expect(stripped).not.toContain("kubectl.kubernetes.io/last-applied-configuration");
    expect(stripped).not.toContain("{\"a\":1}");
    expect(stripped).toContain("spec:");
  });

  it("is stable for texts without those fields", () => {
    expect(stripK8sMetadataNoise("a\nb")).toBe("a\nb");
  });
});
