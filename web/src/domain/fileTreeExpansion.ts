import type { FileTreeNode } from "./fileTreeTypes";

/** 所有「可作为展开目标」的目录路径（含非空 children 的节点）。 */
export function collectDirectoryRelativePaths(root: FileTreeNode): string[] {
  const out: string[] = [];
  const walk = (n: FileTreeNode) => {
    if (n.children?.length) {
      out.push(n.relativePath);
      for (const c of n.children) walk(c);
    }
  };
  walk(root);
  return out;
}

/** 初次加载后仅展开根目录。 */
export function defaultExpandedPaths(root: FileTreeNode): Set<string> {
  return new Set([root.relativePath]);
}
