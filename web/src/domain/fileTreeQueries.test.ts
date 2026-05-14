import { describe, expect, it } from "vitest";

import { buildTreeFromFileList } from "./buildFileTree";
import { findFileAtRelativePath } from "./fileTreeQueries";

function fileAt(path: string, name: string, content = "x"): File {
  const f = new File([content], name, { type: "text/plain" });
  Object.defineProperty(f, "webkitRelativePath", { value: path, enumerable: true });
  return f;
}

describe("findFileAtRelativePath", () => {
  it("returns file for leaf path", () => {
    const root = buildTreeFromFileList([fileAt("p/a.txt", "a.txt", "hello")]);
    expect(root).not.toBeNull();
    const f = findFileAtRelativePath(root!, "p/a.txt");
    expect(f).toBeInstanceOf(File);
    expect(f?.name).toBe("a.txt");
  });
});
