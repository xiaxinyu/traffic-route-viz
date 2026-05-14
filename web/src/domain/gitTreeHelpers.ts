import type { FileTreeNode } from "./fileTreeTypes";

function isDotGitSegment(name: string): boolean {
  return name === ".git" || name.toLowerCase() === ".git";
}

/** 从树中移除名为 `.git` 的目录节点及其子树（用于 UI 折叠展示）。 */
export function filterDotGitFromTree(root: FileTreeNode, showDotGit: boolean): FileTreeNode {
  if (showDotGit) return root;

  const prune = (node: FileTreeNode): FileTreeNode => {
    const kids = node.children
      ?.filter((c) => !isDotGitSegment(c.name))
      .map(prune);
    const nextChildren = kids?.length ? kids : node.children?.length ? [] : undefined;
    return {
      ...node,
      children: nextChildren,
    };
  };

  return prune(root);
}

/** 在整棵树中查找任意路径以 `/.git/config` 结尾的叶子 `File`（浏览器导入的相对路径使用 `/`）。 */
export function findDotGitConfigFile(root: FileTreeNode): File | null {
  const all = collectDotGitRepos(root);
  return all[0]?.configFile ?? null;
}

export type DotGitRepoEntry = {
  /** 含 `.git` 的目录的父路径，即工作区根（与 `webkitRelativePath` 前缀一致）。 */
  repoRootRelativePath: string;
  configFile: File;
};

function repoRootFromGitConfigPath(relativePath: string): string | null {
  const norm = relativePath.replace(/\\/g, "/");
  const m = /^(.*)\/\.git\/config$/i.exec(norm);
  return m?.[1] ?? null;
}

/** 收集树内所有 `.git/config` 对应的工作区根（支持同次导入下的多个嵌套 Git 仓库）。 */
export function collectDotGitRepos(root: FileTreeNode): DotGitRepoEntry[] {
  const out: DotGitRepoEntry[] = [];

  const walk = (node: FileTreeNode): void => {
    if (node.file) {
      const norm = node.relativePath.replace(/\\/g, "/");
      if (/\.git\/config$/i.test(norm)) {
        const repoRoot = repoRootFromGitConfigPath(norm);
        if (repoRoot) {
          out.push({ repoRootRelativePath: repoRoot, configFile: node.file });
        }
      }
      return;
    }
    if (!node.children) return;
    for (const c of node.children) walk(c);
  };

  walk(root);
  out.sort((a, b) => a.repoRootRelativePath.localeCompare(b.repoRootRelativePath));
  return out;
}
