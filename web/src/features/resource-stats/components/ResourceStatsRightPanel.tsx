import { useMemo, useState } from "react";

import { parseGitRemoteForDisplay } from "../../../domain/gitRemoteDisplay";
import { formatCpuFromMilli, formatMemoryFromBytes } from "../../../domain/k8sQuantity";
import { helmAnchorTierForPath, type ValuesDirectoryStats } from "../../../domain/valuesResourceStats";
import type {
  GitRepoResolved,
  GitReposState,
  ValuesStatsState,
} from "../hooks/useLocalFolderScan";

type Props = {
  gitReposState: GitReposState;
  activeGitRepoRoot: string | null;
  gitReposOrdered: GitRepoResolved[];
  valuesStatsState: ValuesStatsState;
  selectedPath: string | null;
};

type StackKey = 0 | 1 | 2;

type StackMeta = {
  key: StackKey;
  title: string;
};

const STACKS: StackMeta[] = [
  { key: 0, title: "master-data" },
  { key: 1, title: "stock-physical" },
  { key: 2, title: "Other" },
];

function shortValuesDirLabel(directoryPath: string): string {
  const p = directoryPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (p.length >= 2) return `${p[p.length - 2]}/${p[p.length - 1]}`;
  return directoryPath;
}

function hasPathPrefix(path: string, prefix: string): boolean {
  if (!path || !prefix) return false;
  if (path === prefix) return true;
  return path.startsWith(`${prefix}/`);
}

function WeightedResourcePills({ s }: { s: ValuesDirectoryStats["stanzaSummary"] }) {
  const tip =
    "Replicas are read from the nearest parent replicaCount/replicas and multiplied per resources block; missing counts as 1." +
    " CPU is shown in cores (1000m = 1 core); memory in Gi (1024Mi = 1Gi)." +
    (s.weightedPartial ? " Some scalars could not be parsed and were skipped." : "");
  const reqCpu = s.weightedHasRequestsCpu ? formatCpuFromMilli(s.weightedRequestsCpuMillisTotal) : "—";
  const limCpu = s.weightedHasLimitsCpu ? formatCpuFromMilli(s.weightedLimitsCpuMillisTotal) : "—";
  const reqMem = s.weightedHasRequestsMemory ? formatMemoryFromBytes(s.weightedRequestsMemoryBytesTotal) : "—";
  const limMem = s.weightedHasLimitsMemory ? formatMemoryFromBytes(s.weightedLimitsMemoryBytesTotal) : "—";
  return (
    <div
      className="rs-values-bucket-pills rs-values-bucket-pills--weighted"
      aria-label="Replica-weighted resources totals"
      title={tip}
    >
      <span className="rs-values-bucket-pill">
        <span className="rs-values-bucket-pill-label">req.cpu</span>
        <span className="rs-values-bucket-pill-values">{reqCpu}</span>
      </span>
      <span className="rs-values-bucket-pill">
        <span className="rs-values-bucket-pill-label">limits.cpu</span>
        <span className="rs-values-bucket-pill-values">{limCpu}</span>
      </span>
      <span className="rs-values-bucket-pill">
        <span className="rs-values-bucket-pill-label">req.mem</span>
        <span className="rs-values-bucket-pill-values">{reqMem}</span>
      </span>
      <span className="rs-values-bucket-pill">
        <span className="rs-values-bucket-pill-label">limits.mem</span>
        <span className="rs-values-bucket-pill-values">{limMem}</span>
      </span>
    </div>
  );
}

function ValuesEnvCard({ dir, selectedPath }: { dir: ValuesDirectoryStats; selectedPath: string | null }) {
  const isSelected = !!selectedPath && hasPathPrefix(selectedPath, dir.directoryPath);

  return (
    <li className={`rs-values-dir-card${isSelected ? " rs-values-dir-card--active" : ""}`}>
      <div className="rs-values-dir-head">
        <div className="rs-values-dir-head-text">
          <strong title={dir.directoryPath}>{shortValuesDirLabel(dir.directoryPath)}</strong>
          <span className="rs-values-dir-path-full" title={dir.directoryPath}>
            {dir.directoryPath}
          </span>
        </div>
        <span className="rs-values-dir-head-count" title="resources blocks in values files, weighted by replicas">
          {dir.resourceEntryCount} workload
        </span>
      </div>

      {dir.chart ? (
        <div className="rs-values-chart-compact" aria-label="Chart metadata">
          <span className="rs-values-chart-pill">chart v{dir.chart.chartVersion ?? "—"}</span>
          {dir.chart.dependencies.slice(0, 1).map((dep) => (
            <span key={`${dep.name}-${dep.version ?? "na"}`} className="rs-values-chart-pill rs-values-chart-pill--dep">
              {dep.name} {dep.version ?? "—"}
            </span>
          ))}
          {dir.chart.dependencies[0]?.repository ? (
            <span className="rs-values-chart-repo" title={dir.chart.dependencies[0].repository}>
              {dir.chart.dependencies[0].repository}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="rs-values-chart-compact">
          <span className="rs-values-chart-pill rs-values-chart-pill--muted">No Chart.yaml</span>
        </div>
      )}

      <div className="rs-values-bucket-bar">
        <span className="rs-values-bucket-k">{dir.valuesFiles.length} values file(s)</span>
        <WeightedResourcePills s={dir.stanzaSummary} />
      </div>
      {dir.stanzaSummary.weightedPartial ? (
        <p className="rs-right-muted rs-values-weighted-note">
          Some cpu/memory scalars could not be parsed; those rows were skipped in totals.
        </p>
      ) : null}

      {dir.valuesFiles.some((vf) => vf.parseError) ? (
        <ul className="rs-values-parse-errors">
          {dir.valuesFiles
            .filter((vf) => vf.parseError)
            .map((vf) => (
              <li key={vf.relativePath}>
                <code title={vf.relativePath}>{vf.relativePath}</code>
                <span>{vf.parseError}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </li>
  );
}

function GitRepoCard({
  repo,
  activeGitRepoRoot,
  repoCount,
}: {
  repo: GitRepoResolved;
  activeGitRepoRoot: string | null;
  repoCount: number;
}) {
  const isActive = !!activeGitRepoRoot && repo.repoRootPath === activeGitRepoRoot;
  const parts = repo.originUrl ? parseGitRemoteForDisplay(repo.originUrl) : null;
  return (
    <li className={`rs-git-repo-card${isActive ? " rs-git-repo-card--active" : ""}`}>
      <div className="rs-git-repo-card-head">
        <span className="rs-git-repo-card-title">{repo.repoFolderLabel}</span>
        {repoCount > 1 && isActive ? <span className="rs-git-repo-card-badge">Active</span> : null}
      </div>
      <div className="rs-git-repo-card-sub" title={repo.repoRootPath}>
        {repo.repoRootPath}
      </div>
      {repo.fileReadFailed ? (
        <div className="rs-git-remote-muted">Could not read .git/config</div>
      ) : !repo.originUrl ? (
        <div className="rs-git-remote-muted">origin.url not set</div>
      ) : parts ? (
        <dl className="rs-git-repo-dl">
          <div className="rs-git-repo-dl-row">
            <dt>origin</dt>
            <dd>
              {parts.browserHref ? (
                <a className="rs-git-remote-link" href={parts.browserHref} target="_blank" rel="noopener noreferrer">
                  {parts.raw}
                </a>
              ) : (
                <code className="rs-git-repo-raw">{parts.raw}</code>
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </li>
  );
}

function filterReposByTier(repos: GitRepoResolved[], tier: number): GitRepoResolved[] {
  return repos.filter((r) => helmAnchorTierForPath(r.repoRootPath) === tier);
}

function filterDirsByTier(dirs: ValuesDirectoryStats[], tier: number): ValuesDirectoryStats[] {
  return dirs.filter((d) => helmAnchorTierForPath(d.directoryPath) === tier);
}

function selectedTierFromPath(path: string | null): StackKey | null {
  if (!path) return null;
  return helmAnchorTierForPath(path) as StackKey;
}

function sortDirsByFocus(dirs: ValuesDirectoryStats[], selectedPath: string | null): ValuesDirectoryStats[] {
  if (!selectedPath) return dirs;
  return [...dirs].sort((a, b) => {
    const ah = hasPathPrefix(selectedPath, a.directoryPath);
    const bh = hasPathPrefix(selectedPath, b.directoryPath);
    if (ah !== bh) return ah ? -1 : 1;
    return a.directoryPath.localeCompare(b.directoryPath);
  });
}

export function ResourceStatsRightPanel({
  gitReposState,
  activeGitRepoRoot,
  gitReposOrdered,
  valuesStatsState,
  selectedPath,
}: Props) {
  const [focusCurrent, setFocusCurrent] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<StackKey>>(new Set());

  const dirs: ValuesDirectoryStats[] =
    valuesStatsState.kind === "ready" ? valuesStatsState.stats.directories : [];

  const valsKind = valuesStatsState.kind;
  const helmLoading = valsKind === "idle" || valsKind === "loading";
  const noValuesAnywhere = valsKind === "ready" && dirs.length === 0;
  const activeTier = selectedTierFromPath(selectedPath);

  const parseErrorCount = useMemo(
    () => dirs.reduce((sum, d) => sum + d.valuesFiles.filter((f) => !!f.parseError).length, 0),
    [dirs],
  );

  const stacks = useMemo(
    () =>
      STACKS.map((meta) => {
        const tierRepos = filterReposByTier(gitReposOrdered, meta.key);
        const tierDirs = sortDirsByFocus(filterDirsByTier(dirs, meta.key), selectedPath);
        return {
          ...meta,
          repos: tierRepos,
          dirs: tierDirs,
          workloadCount: tierDirs.reduce((n, d) => n + d.resourceEntryCount, 0),
        };
      }),
    [gitReposOrdered, dirs, selectedPath],
  );

  const visibleStacks = useMemo(() => {
    if (!focusCurrent || activeTier == null) return stacks;
    return stacks.filter((s) => s.key === activeTier || (s.key !== activeTier && (s.repos.length > 0 || s.dirs.length > 0)));
  }, [focusCurrent, activeTier, stacks]);

  const toggleCollapsed = (k: StackKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const collapseAll = () => setCollapsed(new Set([0, 1, 2]));
  const expandAll = () => setCollapsed(new Set());

  return (
    <aside className="rs-right-panel" aria-label="Git and Helm details">
      <section className="left-panel-block grow rs-right-block rs-right-unified">
        <div className="rs-right-section-head">
          <div className="rs-right-section-head__title-wrap">
            <h2 className="rs-right-section-head__title">Details</h2>
            <p className="rs-right-section-head__desc">Git, Chart metadata, and workload-weighted resources by group.</p>
          </div>
        </div>
        <div className="rs-right-topbar">
          <div className="rs-right-health" aria-label="Parse health">
            <span className="status-pill">Groups {stacks.filter((s) => s.repos.length > 0 || s.dirs.length > 0).length}</span>
            <span className="status-pill">workload {dirs.reduce((n, d) => n + d.resourceEntryCount, 0)}</span>
            <span className={`status-pill${parseErrorCount > 0 ? " rs-pill-warn" : ""}`}>parse err {parseErrorCount}</span>
          </div>
          <div className="rs-right-actions">
            <button type="button" className="btn-secondary rs-mini-btn" onClick={() => setFocusCurrent((v) => !v)}>
              {focusCurrent ? "Show all groups" : "Focus current tier"}
            </button>
            <button type="button" className="btn-secondary rs-mini-btn" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="btn-secondary rs-mini-btn" onClick={collapseAll}>
              Collapse all
            </button>
          </div>
        </div>

        <div className="rs-right-global-status" data-testid="resource-stats-git-remote">
          {gitReposState.kind === "loading" ? <p className="rs-right-muted">Loading Git metadata…</p> : null}
          {gitReposState.kind === "none" ? <p className="rs-right-muted">No local Git config found</p> : null}
          {helmLoading ? <p className="rs-right-muted">Scanning values / Chart…</p> : null}
          {valsKind === "error" ? (
            <p className="rs-right-muted" role="alert">
              Stats error: {valuesStatsState.message}
            </p>
          ) : null}
          {valsKind === "ready" && noValuesAnywhere ? (
            <p className="rs-right-muted">No values*.yaml found. Import a Helm-style folder to populate this panel.</p>
          ) : null}
        </div>

        {gitReposState.kind === "ready" && gitReposOrdered.length > 1 ? (
          <div className="rs-git-repo-meta rs-git-repo-meta--top">
            <span className="rs-git-repo-count-pill">{gitReposOrdered.length} Git repo(s)</span>
            {activeGitRepoRoot ? (
              <span className="rs-git-active-pill" title={activeGitRepoRoot}>
                Preview match:
                {gitReposOrdered.find((r) => r.repoRootPath === activeGitRepoRoot)?.repoFolderLabel ?? activeGitRepoRoot}
              </span>
            ) : (
              <span className="rs-git-remote-muted rs-git-active-hint">Selecting a file highlights the matching origin</span>
            )}
          </div>
        ) : null}

        <div className="rs-product-stacks rs-values-wrap rs-values-wrap--detail" data-testid={valsKind === "ready" ? "resource-stats-values-stats" : undefined}>
          {visibleStacks.map((stack) => {
            const isOpen = !collapsed.has(stack.key);
            const showStack =
              stack.repos.length > 0 ||
              stack.dirs.length > 0 ||
              (stack.key <= 1 && helmLoading) ||
              (stack.key === 2 && valsKind === "ready");
            if (!showStack) return null;

            return (
              <section key={stack.key} className={`rs-product-stack${activeTier === stack.key ? " rs-product-stack--focus" : ""}`} aria-label={stack.title}>
                <button type="button" className="rs-product-stack-head" onClick={() => toggleCollapsed(stack.key)} aria-expanded={isOpen}>
                  <h3 className="rs-product-stack-title">{stack.title}</h3>
                  <div className="rs-product-stack-badges">
                    <span className="status-pill">repo {stack.repos.length}</span>
                    <span className="status-pill">workload {stack.workloadCount}</span>
                    <span className="rs-product-stack-chevron">{isOpen ? "▾" : "▸"}</span>
                  </div>
                </button>

                {isOpen ? (
                  <>
                    <div className="rs-product-git-block">
                      <h4 className="rs-product-subhead">Git repos</h4>
                      {gitReposState.kind === "ready" && stack.repos.length > 0 ? (
                        <ul className="rs-git-repo-list rs-git-repo-list--stacked">
                          {stack.repos.map((repo) => (
                            <GitRepoCard
                              key={repo.repoRootPath}
                              repo={repo}
                              activeGitRepoRoot={activeGitRepoRoot}
                              repoCount={gitReposOrdered.length}
                            />
                          ))}
                        </ul>
                      ) : (
                        <p className="rs-right-muted">No Git repos in this group.</p>
                      )}
                    </div>

                    <div className="rs-product-helm-block">
                      <h4 className="rs-product-subhead">Workloads</h4>
                      {valsKind === "ready" && stack.dirs.length === 0 && !noValuesAnywhere ? (
                        <p className="rs-right-muted">No subfolders with values*.yaml in this group.</p>
                      ) : null}
                      {valsKind === "ready" && stack.dirs.length > 0 ? (
                        <ul className="rs-values-dir-list">
                          {stack.dirs.map((dir) => (
                            <ValuesEnvCard key={dir.directoryPath} dir={dir} selectedPath={selectedPath} />
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
