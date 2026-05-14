import { describe, expect, it } from "vitest";

import { buildTreeFromFileList } from "./buildFileTree";

function makeFile(path: string, name = "x"): File {
  const f = new File([""], name, { type: "text/plain" });
  Object.defineProperty(f, "webkitRelativePath", { value: path, enumerable: true });
  return f;
}

describe("buildTreeFromFileList", () => {
  it("builds nested tree from webkitRelativePath", () => {
    const files = [
      makeFile("RTS-ROLLOUT/master-data/a.yaml", "a.yaml"),
      makeFile("RTS-ROLLOUT/stock-physical/b.yaml", "b.yaml"),
    ];
    const tree = buildTreeFromFileList(files);
    expect(tree?.name).toBe("RTS-ROLLOUT");
    expect(tree?.children?.map((c) => c.name).sort()).toEqual(["master-data", "stock-physical"]);
  });
});
