import { describe, expect, it } from "vitest";

import type { ParseResult } from "./domain/k8sParser";
import { parseK8sYaml } from "./domain/k8sParser";
import {
  mergeParseResults,
  mergeYamlFiles,
  type ImportedYamlFile,
} from "./domain/mergeYamlBundles";

describe("mergeYamlFiles", () => {
  it("returns empty string for no files", () => {
    expect(mergeYamlFiles([])).toBe("");
  });

  it("returns single file text unchanged", () => {
    const files: ImportedYamlFile[] = [{ name: "a.yaml", text: "apiVersion: v1\nkind: Pod" }];
    expect(mergeYamlFiles(files)).toBe("apiVersion: v1\nkind: Pod");
  });

  it("joins multiple files with document separators", () => {
    const files: ImportedYamlFile[] = [
      { name: "a.yaml", text: "a: 1" },
      { name: "b.yaml", text: "b: 2" },
    ];
    expect(mergeYamlFiles(files)).toBe("a: 1\n---\nb: 2");
  });
});

describe("mergeParseResults", () => {
  it("dedupes ingresses by namespace/name and merges tls and sourceFiles", () => {
    const baseIngress = {
      kind: "Ingress" as const,
      name: "ing",
      namespace: "ns",
      tls: [{ hosts: ["a.example"], secretName: "tls-a" }],
      loadBalancerIps: [] as string[],
      sourceFiles: ["one.yaml"],
    };
    const r1: ParseResult = {
      ingresses: [baseIngress],
      routes: [],
      services: [],
      endpoints: [],
      gateways: [],
      destinationRules: [],
      errors: ["e1"],
    };
    const r2: ParseResult = {
      ingresses: [
        {
          ...baseIngress,
          tls: [{ hosts: ["b.example"], secretName: "tls-b" }],
          sourceFiles: ["two.yaml"],
        },
      ],
      routes: [],
      services: [],
      endpoints: [],
      gateways: [],
      destinationRules: [],
      errors: ["e2"],
    };
    const merged = mergeParseResults([r1, r2]);
    expect(merged.errors).toEqual(["e1", "e2"]);
    expect(merged.ingresses).toHaveLength(1);
    expect(merged.ingresses[0]!.tls).toHaveLength(2);
    expect(new Set(merged.ingresses[0]!.sourceFiles ?? [])).toEqual(
      new Set(["one.yaml", "two.yaml"]),
    );
  });

  it("merges endpoint addresses for the same key", () => {
    const ep = {
      key: "ns/svc",
      name: "svc",
      namespace: "ns",
      addresses: ["10.0.0.1"],
      ports: [{ port: 80, protocol: "TCP" }],
      sourceFiles: ["a.yaml"],
    };
    const r1: ParseResult = {
      ingresses: [],
      routes: [],
      services: [],
      endpoints: [ep],
      gateways: [],
      destinationRules: [],
      errors: [],
    };
    const r2: ParseResult = {
      ingresses: [],
      routes: [],
      services: [],
      endpoints: [{ ...ep, addresses: ["10.0.0.2"], sourceFiles: ["b.yaml"] }],
      gateways: [],
      destinationRules: [],
      errors: [],
    };
    const merged = mergeParseResults([r1, r2]);
    expect(merged.endpoints).toHaveLength(1);
    expect(merged.endpoints[0]!.addresses.sort()).toEqual(["10.0.0.1", "10.0.0.2"]);
  });
});

describe("parseK8sYaml empty document", () => {
  it("returns structured empty result without throwing", () => {
    const r = parseK8sYaml("", "empty.yaml");
    expect(r.ingresses).toEqual([]);
    expect(r.services).toEqual([]);
    expect(r.endpoints).toEqual([]);
    expect(r.routes).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});
