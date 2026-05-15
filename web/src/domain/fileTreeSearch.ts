import type { FileTreeNode } from "./fileTreeTypes";

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function filterTreeByQuery(root: FileTreeNode, query: string): FileTreeNode | null {
  if (!query) return root;
  const q = normalizeQuery(query);

  const walk = (node: FileTreeNode): FileTreeNode | null => {
    const selfHit =
      normalizeQuery(node.name).includes(q) || normalizeQuery(node.relativePath).includes(q);
    if (!node.children?.length) {
      return selfHit ? node : null;
    }

    const children = node.children.map(walk).filter((c): c is FileTreeNode => !!c);
    if (selfHit || children.length > 0) {
      return {
        ...node,
        children,
      };
    }
    return null;
  };

  return walk(root);
}

export function collectDirectoryPaths(root: FileTreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (node: FileTreeNode): void => {
    if (!node.children?.length) return;
    out.add(node.relativePath);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return out;
}

export function countTreeNodes(root: FileTreeNode): { directories: number; files: number } {
  let directories = 0;
  let files = 0;
  const walk = (node: FileTreeNode): void => {
    if (node.children?.length) {
      directories += 1;
      for (const child of node.children) walk(child);
      return;
    }
    files += 1;
  };
  walk(root);
  return { directories, files };
}
