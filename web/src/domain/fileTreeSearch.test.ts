import { describe, expect, it } from "vitest";

import { collectDirectoryPaths, countTreeNodes, filterTreeByQuery } from "./fileTreeSearch";
import type { FileTreeNode } from "./fileTreeTypes";

const tree: FileTreeNode = {
  name: "repo",
  relativePath: "",
  children: [
    {
      name: "charts",
      relativePath: "charts",
      children: [
        {
          name: "values.yaml",
          relativePath: "charts/values.yaml",
        },
      ],
    },
    {
      name: "apps",
      relativePath: "apps",
      children: [
        {
          name: "gateway.yaml",
          relativePath: "apps/gateway.yaml",
        },
      ],
    },
  ],
};

describe("filterTreeByQuery", () => {
  it("keeps only matching branches while preserving ancestor directories", () => {
    const filtered = filterTreeByQuery(tree, "values");
    expect(filtered).toBeTruthy();
    expect(filtered?.children).toHaveLength(1);
    expect(filtered?.children?.[0]?.name).toBe("charts");
    expect(filtered?.children?.[0]?.children?.[0]?.name).toBe("values.yaml");
  });

  it("returns null when nothing matches", () => {
    expect(filterTreeByQuery(tree, "not-found")).toBeNull();
  });
});

describe("collectDirectoryPaths", () => {
  it("collects all directory relative paths", () => {
    const dirs = collectDirectoryPaths(tree);
    expect(dirs).toEqual(new Set(["", "charts", "apps"]));
  });
});

describe("countTreeNodes", () => {
  it("returns directory and file counts", () => {
    expect(countTreeNodes(tree)).toEqual({
      directories: 3,
      files: 2,
    });
  });
});
