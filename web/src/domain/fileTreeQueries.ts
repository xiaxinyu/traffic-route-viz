import type { FileTreeNode } from "./fileTreeTypes";

/** 在树中按 `relativePath` 查找叶子文件（含 `File` 的节点）。 */
export function findFileAtRelativePath(root: FileTreeNode, relativePath: string): File | null {
  if (root.relativePath === relativePath && root.file) return root.file;
  if (!root.children) return null;
  for (const ch of root.children) {
    const hit = findFileAtRelativePath(ch, relativePath);
    if (hit) return hit;
  }
  return null;
}
