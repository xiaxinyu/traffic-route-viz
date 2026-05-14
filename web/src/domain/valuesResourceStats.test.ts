import { describe, expect, it } from "vitest";

import type { FileTreeNode } from "./fileTreeTypes";
import { aggregationBucketForValuesDir, buildValuesResourceStats, helmAnchorTierForPath } from "./valuesResourceStats";

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
    expect(stats.summary.weightedHasRequestsCpu).toBe(true);
    expect(stats.summary.weightedRequestsCpuMillisTotal).toBe(500);
    expect(stats.summary.weightedHasLimitsCpu).toBe(true);
    expect(stats.summary.weightedLimitsCpuMillisTotal).toBe(2000);
    expect(stats.summary.weightedHasLimitsMemory).toBe(true);
    expect(stats.summary.weightedLimitsMemoryBytesTotal).toBe(4 * 1024 ** 3);
    expect(stats.summary.weightedPartial).toBe(false);

    const dir = stats.directories[0];
    expect(dir?.directoryPath).toBe("ROOT/app-a");
    expect(dir?.chart?.dependencies[0]?.version).toBe("0.1.0-317ad8ee");
    expect(dir?.chart?.dependencies[0]?.repository).toContain("chartrepo/rts-aswatson");
    expect(dir?.stanzaSummary.limitsCpuCount).toBe(1);
    expect(dir?.stanzaSummary.limitsCpuValues).toEqual(["2"]);
    expect(dir?.stanzaSummary.limitsMemoryCount).toBe(1);
    expect(dir?.stanzaSummary.limitsMemoryValues).toEqual(["4Gi"]);
    expect(dir?.stanzaSummary.requestsCpuCount).toBe(1);
    expect(dir?.stanzaSummary.requestsCpuValues).toEqual(["500m"]);
    expect(dir?.stanzaSummary.weightedRequestsCpuMillisTotal).toBe(500);
    expect(dir?.stanzaSummary.weightedLimitsCpuMillisTotal).toBe(2000);
    expect(dir?.stanzaSummary.weightedLimitsMemoryBytesTotal).toBe(4 * 1024 ** 3);
    expect(dir?.valuesFiles[0]?.resourceEntries).toHaveLength(0);
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

  it("aggregation bucket groups master-data and stock-physical to second level", () => {
    expect(aggregationBucketForValuesDir("RTS/master-data/active01")).toBe("RTS/master-data/active01");
    expect(aggregationBucketForValuesDir("RTS/master-data/active01/sub")).toBe("RTS/master-data/active01");
    expect(aggregationBucketForValuesDir("RTS/stock-physical/uat/x")).toBe("RTS/stock-physical/uat");
    expect(aggregationBucketForValuesDir("RTS/other/a/b")).toBe("RTS/other/a/b");
  });

  it("helmAnchorTier identifies path anchors", () => {
    expect(helmAnchorTierForPath("RTS/master-data/active01")).toBe(0);
    expect(helmAnchorTierForPath("RTS/stock-physical/uat")).toBe(1);
    expect(helmAnchorTierForPath("RTS/other/a")).toBe(2);
  });

  it("merges multiple values dirs under same master-data second level", async () => {
    const valuesYaml = (cpu: string) =>
      ["svc:", "  resources:", "    limits:", `      cpu: ${cpu}`, "    requests:", "      cpu: 100m"].join("\n");
    const root: FileTreeNode = {
      name: "RTS",
      relativePath: "RTS",
      children: [
        {
          name: "master-data",
          relativePath: "RTS/master-data",
          children: [
            {
              name: "env1",
              relativePath: "RTS/master-data/env1",
              children: [
                {
                  name: "values.yaml",
                  relativePath: "RTS/master-data/env1/values.yaml",
                  file: makeFile("values.yaml", valuesYaml("1")),
                },
                {
                  name: "nested",
                  relativePath: "RTS/master-data/env1/nested",
                  children: [
                    {
                      name: "values.yaml",
                      relativePath: "RTS/master-data/env1/nested/values.yaml",
                      file: makeFile("values.yaml", valuesYaml("2")),
                    },
                  ],
                },
                {
                  name: "Chart.yaml",
                  relativePath: "RTS/master-data/env1/Chart.yaml",
                  file: makeFile(
                    "Chart.yaml",
                    ["apiVersion: v2", "name: x", "version: 1.0.0", "appVersion: \"2\""].join("\n"),
                  ),
                },
              ],
            },
          ],
        },
      ],
    };

    const stats = await buildValuesResourceStats(root);
    expect(stats.directories).toHaveLength(1);
    const d = stats.directories[0]!;
    expect(d.directoryPath).toBe("RTS/master-data/env1");
    expect(d.valuesFiles).toHaveLength(2);
    expect(d.resourceEntryCount).toBe(2);
    expect(d.stanzaSummary.limitsCpuCount).toBe(2);
    expect(d.stanzaSummary.limitsCpuValues.sort()).toEqual(["1", "2"].sort());
    expect(d.stanzaSummary.requestsCpuCount).toBe(2);
    expect(d.stanzaSummary.requestsCpuValues).toEqual(["100m"]);
    expect(d.stanzaSummary.weightedRequestsCpuMillisTotal).toBe(200);
    expect(d.stanzaSummary.weightedLimitsCpuMillisTotal).toBe(3000);
    expect(stats.summary.directoryCount).toBe(1);
    expect(stats.summary.valuesFileCount).toBe(2);
  });

  it("lists master-data environments before stock-physical after merge", async () => {
    const yaml = ["svc:", "  resources:", "    limits:", "      cpu: 1", ""].join("\n");
    const root: FileTreeNode = {
      name: "RTS",
      relativePath: "RTS",
      children: [
        {
          name: "stock-physical",
          relativePath: "RTS/stock-physical",
          children: [
            {
              name: "u1",
              relativePath: "RTS/stock-physical/u1",
              children: [
                {
                  name: "values.yaml",
                  relativePath: "RTS/stock-physical/u1/values.yaml",
                  file: makeFile("values.yaml", yaml),
                },
              ],
            },
          ],
        },
        {
          name: "master-data",
          relativePath: "RTS/master-data",
          children: [
            {
              name: "e1",
              relativePath: "RTS/master-data/e1",
              children: [
                {
                  name: "values.yaml",
                  relativePath: "RTS/master-data/e1/values.yaml",
                  file: makeFile("values.yaml", yaml),
                },
              ],
            },
          ],
        },
      ],
    };

    const stats = await buildValuesResourceStats(root);
    expect(stats.directories.map((d) => d.directoryPath)).toEqual(["RTS/master-data/e1", "RTS/stock-physical/u1"]);
  });

  it("multiplies per-pod resources by replicaCount from the same parent object", async () => {
    const yaml = [
      "svc:",
      "  replicaCount: 2",
      "  resources:",
      "    limits:",
      "      cpu: 1",
      "      memory: 512Mi",
      "    requests:",
      "      cpu: 250m",
    ].join("\n");
    const root: FileTreeNode = {
      name: "RTS",
      relativePath: "RTS",
      children: [
        {
          name: "app",
          relativePath: "RTS/app",
          children: [
            {
              name: "values.yaml",
              relativePath: "RTS/app/values.yaml",
              file: makeFile("values.yaml", yaml),
            },
          ],
        },
      ],
    };

    const stats = await buildValuesResourceStats(root);
    const d = stats.directories[0]!;
    expect(d.resourceEntryCount).toBe(1);
    expect(d.stanzaSummary.weightedRequestsCpuMillisTotal).toBe(500);
    expect(d.stanzaSummary.weightedLimitsCpuMillisTotal).toBe(2000);
    expect(d.stanzaSummary.weightedLimitsMemoryBytesTotal).toBe(512 * 1024 ** 2 * 2);
  });
});
