import type { FileTreeNode } from "./fileTreeTypes";

export type { FileTreeNode } from "./fileTreeTypes";

function ensureChildDir(
  parent: FileTreeNode,
  segment: string,
  relativePath: string,
): FileTreeNode {
  if (!parent.children) parent.children = [];
  let node = parent.children.find((c) => c.name === segment && c.children);
  if (!node) {
    node = { name: segment, relativePath, children: [] };
    parent.children.push(node);
  }
  return node;
}

function ensureLeaf(parent: FileTreeNode, segment: string, relativePath: string, file: File): void {
  if (!parent.children) parent.children = [];
  const existing = parent.children.find((c) => c.name === segment && c.file);
  if (existing) {
    existing.file = file;
    existing.relativePath = relativePath;
    return;
  }
  parent.children.push({ name: segment, relativePath, file });
}

/**
 * 使用浏览器 `webkitRelativePath` 将所选文件夹中的文件还原为树。
 */
export function buildTreeFromFileList(files: Iterable<File>): FileTreeNode | null {
  const list = [...files];
  if (list.length === 0) return null;

  const first = list[0] as File & { webkitRelativePath?: string };
  const sample = first.webkitRelativePath;
  if (!sample) {
    return null;
  }

  const rootFolderName = sample.split("/")[0] ?? "root";
  const root: FileTreeNode = {
    name: rootFolderName,
    relativePath: rootFolderName,
    children: [],
  };

  for (const file of list) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (!rel) continue;
    const parts = rel.split("/").filter(Boolean);
    if (parts.length < 2) continue;

    let cursor = root;
    let acc = rootFolderName;
    for (let i = 1; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      acc = `${acc}/${seg}`;
      cursor = ensureChildDir(cursor, seg, acc);
    }
    const fileName = parts[parts.length - 1]!;
    acc = `${acc}/${fileName}`;
    ensureLeaf(cursor, fileName, acc, file);
  }

  sortTree(root);
  return root;
}

function sortTree(node: FileTreeNode): void {
  if (!node.children?.length) return;
  node.children.sort((a, b) => {
    const ad = a.children ? 0 : 1;
    const bd = b.children ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  for (const c of node.children) sortTree(c);
}
