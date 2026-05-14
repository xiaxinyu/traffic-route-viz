/**
 * 在多个已发现的仓库根路径中，根据当前选中的文件路径选出「最内层」包含该文件的仓库。
 */
export function pickActiveGitRepoRoot(repoRoots: string[], selectedPath: string | null): string | null {
  if (!selectedPath || repoRoots.length === 0) return null;
  const norm = selectedPath.replace(/\\/g, "/");
  let best: string | null = null;
  let bestLen = -1;
  for (const root of repoRoots) {
    const r = root.replace(/\\/g, "/");
    if (norm === r || norm.startsWith(`${r}/`)) {
      if (r.length > bestLen) {
        best = r;
        bestLen = r.length;
      }
    }
  }
  return best;
}
