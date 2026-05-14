import { describe, expect, it } from "vitest";

import { buildTreeFromFileList } from "./buildFileTree";
import { collectDirectoryRelativePaths, defaultExpandedPaths } from "./fileTreeExpansion";

function fileAt(path: string, name: string): File {
  const f = new File([""], name, { type: "text/plain" });
  Object.defineProperty(f, "webkitRelativePath", { value: path, enumerable: true });
  return f;
}

describe("fileTreeExpansion", () => {
  it("collects directory paths and default expansion is root only", () => {
    const root = buildTreeFromFileList([
      fileAt("proj/a/x.txt", "x.txt"),
      fileAt("proj/b/y.txt", "y.txt"),
    ]);
    expect(root).not.toBeNull();
    const dirs = collectDirectoryRelativePaths(root!);
    expect(dirs).toContain("proj");
    expect(dirs).toContain("proj/a");
    expect(dirs).toContain("proj/b");
    expect(defaultExpandedPaths(root!)).toEqual(new Set(["proj"]));
  });
});
