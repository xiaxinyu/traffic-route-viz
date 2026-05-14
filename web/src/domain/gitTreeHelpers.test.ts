import { describe, expect, it } from "vitest";

import { buildTreeFromFileList } from "./buildFileTree";
import { collectDotGitRepos, filterDotGitFromTree, findDotGitConfigFile } from "./gitTreeHelpers";

function fileAt(path: string, name: string, content = "x"): File {
  const f = new File([content], name, { type: "text/plain" });
  Object.defineProperty(f, "webkitRelativePath", { value: path, enumerable: true });
  return f;
}

describe("gitTreeHelpers", () => {
  it("finds .git/config file in tree", () => {
    const root = buildTreeFromFileList([
      fileAt("proj/.git/config", "config", "[remote \"origin\"]\n\turl = https://a.git\n"),
      fileAt("proj/readme.md", "readme.md"),
    ]);
    expect(root).not.toBeNull();
    const f = findDotGitConfigFile(root!);
    expect(f).toBeInstanceOf(File);
  });

  it("collects multiple .git/config roots", () => {
    const root = buildTreeFromFileList([
      fileAt("RTS-ROLLOUT/master-data/.git/config", "config", "a"),
      fileAt("RTS-ROLLOUT/stock-physical/.git/config", "config", "b"),
      fileAt("RTS-ROLLOUT/readme.md", "readme.md"),
    ]);
    expect(root).not.toBeNull();
    const repos = collectDotGitRepos(root!);
    expect(repos.map((r) => r.repoRootRelativePath)).toEqual([
      "RTS-ROLLOUT/master-data",
      "RTS-ROLLOUT/stock-physical",
    ]);
  });

  it("filters .git directory when disabled", () => {
    const root = buildTreeFromFileList([
      fileAt("proj/.git/config", "config"),
      fileAt("proj/src/a.ts", "a.ts"),
    ]);
    const filtered = filterDotGitFromTree(root!, false);
    const names = filtered.children?.map((c) => c.name) ?? [];
    expect(names).not.toContain(".git");
    expect(names).toContain("src");
  });

  it("returns same root when .git is shown", () => {
    const root = buildTreeFromFileList([
      fileAt("proj/.git/config", "config"),
      fileAt("proj/src/a.ts", "a.ts"),
    ]);
    expect(filterDotGitFromTree(root!, true)).toBe(root);
  });
});
