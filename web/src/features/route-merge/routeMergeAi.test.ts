import { describe, expect, it } from "vitest";

import { buildRouteMergeAiUserContent } from "./routeMergeAi";
import type { IndexedRawDoc } from "./routeMergeRawDocs";
import type { RouteMergeAnalysis } from "./routeMergeTypes";

const analysis: RouteMergeAnalysis = {
  recommendations: [
    {
      id: "safe-1",
      kind: "Ingress",
      level: "safe",
      resourceRefs: ["default/a", "default/b"],
      rationale: "same host and compatible paths",
      estimatedLineDelta: -12,
      warnings: [],
    },
  ],
  v1RulesReminder: "only safe merges",
};

const docs: IndexedRawDoc[] = [
  {
    refKey: "Ingress:default/a",
    sourceFile: "ingress.yaml",
    kind: "Ingress",
    apiVersion: "networking.k8s.io/v1",
    namespace: "default",
    name: "a",
    yaml: "kind: Ingress\nmetadata:\n  name: a\n",
    obj: {
      kind: "Ingress",
      apiVersion: "networking.k8s.io/v1",
      metadata: { namespace: "default", name: "a" },
    },
  },
];

describe("buildRouteMergeAiUserContent", () => {
  it("sends complete current YAML when it fits the request budget", () => {
    const mergedYaml =
      "kind: Ingress\nmetadata:\n  name: a\n---\nkind: Service\nmetadata:\n  name: svc\n";

    const content = buildRouteMergeAiUserContent(analysis, docs, mergedYaml, {
      maxTotalChars: 20_000,
      scopeHeading: "scope",
    });

    expect(content).toContain("当前完整 YAML");
    expect(content).toContain("必须基于它输出完整 optimizedYaml");
    expect(content).toContain(mergedYaml);
  });

  it("keeps optimizedYaml mandatory and explains limits when YAML is too large", () => {
    const mergedYaml = "a".repeat(1_000);

    const content = buildRouteMergeAiUserContent(analysis, docs, mergedYaml, {
      maxTotalChars: 800,
    });

    expect(content).toContain("当前 YAML 过大");
    expect(content).toContain("optimizedYaml 仍必须非空");
    expect(content).toContain("按单文件或较小范围运行 AI");
  });
});
