import { describe, expect, it } from "vitest";

import type { FileTreeNode } from "./fileTreeTypes";
import { buildValuesResourceStats } from "./valuesResourceStats";

function makeFile(name: string, text: string): File {
  return {
    name,
    type: "text/plain",
    size: text.length,
    text: async () => text,
  } as unknown as File;
}

describe("buildValuesResourceStats", () => {
  it("aggregates resources from values files and chart dependency metadata", async () => {
    const root: FileTreeNode = {
      name: "ROOT",
      relativePath: "ROOT",
      children: [
        {
          name: "app-a",
          relativePath: "ROOT/app-a",
          children: [
            {
              name: "values.yaml",
              relativePath: "ROOT/app-a/values.yaml",
              file: makeFile(
                "values.yaml",
                [
                  "serviceA:",
                  "  resources:",
                  "    limits:",
                  "      cpu: 2",
                  "      memory: 4Gi",
                  "    requests:",
                  "      cpu: 500m",
                ].join("\n"),
              ),
            },
            {
              name: "Chart.yaml",
              relativePath: "ROOT/app-a/Chart.yaml",
              file: makeFile(
                "Chart.yaml",
                [
                  "apiVersion: v2",
                  "name: app-a",
                  "version: 0.1.0",
                  "appVersion: 1.2.3",
                  "dependencies:",
                  "  - name: rts",
                  "    version: 0.1.0-317ad8ee",
                  "    repository: http://harbor.example.net/chartrepo/rts-aswatson",
                ].join("\n"),
              ),
            },
          ],
        },
      ],
    };

    const stats = await buildValuesResourceStats(root);
    expect(stats.summary.directoryCount).toBe(1);
    expect(stats.summary.valuesFileCount).toBe(1);
    expect(stats.summary.chartCount).toBe(1);
    expect(stats.summary.resourceEntryCount).toBe(1);
    expect(stats.summary.limitsCpuCount).toBe(1);
    expect(stats.summary.limitsMemoryCount).toBe(1);
    expect(stats.summary.requestsCpuCount).toBe(1);

    const dir = stats.directories[0];
    expect(dir?.directoryPath).toBe("ROOT/app-a");
    expect(dir?.chart?.dependencies[0]?.version).toBe("0.1.0-317ad8ee");
    expect(dir?.chart?.dependencies[0]?.repository).toContain("chartrepo/rts-aswatson");
    expect(dir?.valuesFiles[0]?.resourceEntries[0]?.keyPath).toBe("serviceA.resources");
  });

  it("ignores directories without values files", async () => {
    const root: FileTreeNode = {
      name: "ROOT",
      relativePath: "ROOT",
      children: [
        {
          name: "app-a",
          relativePath: "ROOT/app-a",
          children: [
            {
              name: "Chart.yaml",
              relativePath: "ROOT/app-a/Chart.yaml",
              file: makeFile("Chart.yaml", "version: 0.1.0"),
            },
          ],
        },
      ],
    };

    const stats = await buildValuesResourceStats(root);
    expect(stats.summary.directoryCount).toBe(0);
    expect(stats.directories).toHaveLength(0);
  });
});
