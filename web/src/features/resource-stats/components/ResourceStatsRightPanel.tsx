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
};

function shortValuesDirLabel(directoryPath: string): string {
  const p = directoryPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (p.length >= 2) return `${p[p.length - 2]}/${p[p.length - 1]}`;
  return directoryPath;
}

function WeightedResourcePills({ s }: { s: ValuesDirectoryStats["stanzaSummary"] }) {
  const tip =
    "在父级链上就近读取 replicaCount / replicas，与每条 resources 相乘后加总；未写字段视为 1 副本。" +
    " CPU 以 core 展示（1000m = 1 core），内存以 Gi 展示（1024Mi = 1Gi）。" +
    (s.weightedPartial ? " 部分标量无法解析为数值，已跳过该项。" : "");
  const reqCpu = s.weightedHasRequestsCpu ? formatCpuFromMilli(s.weightedRequestsCpuMillisTotal) : "—";
  const limCpu = s.weightedHasLimitsCpu ? formatCpuFromMilli(s.weightedLimitsCpuMillisTotal) : "—";
  const reqMem = s.weightedHasRequestsMemory ? formatMemoryFromBytes(s.weightedRequestsMemoryBytesTotal) : "—";
  const limMem = s.weightedHasLimitsMemory ? formatMemoryFromBytes(s.weightedLimitsMemoryBytesTotal) : "—";
  return (
    <div className="rs-values-bucket-pills rs-values-bucket-pills--weighted" aria-label="按副本加权后的 resources 合计" title={tip}>
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

function ValuesEnvCard({ dir }: { dir: ValuesDirectoryStats }) {
  return (
    <li className="rs-values-dir-card">
      <div className="rs-values-dir-head">
        <div className="rs-values-dir-head-text">
          <strong title={dir.directoryPath}>{shortValuesDirLabel(dir.directoryPath)}</strong>
          <span className="rs-values-dir-path-full" title={dir.directoryPath}>
            {dir.directoryPath}
          </span>
        </div>
        <span className="rs-values-dir-head-count" title="values 中 resources 块数量，按块解析副本并加权">
          {dir.resourceEntryCount} 个 workload
        </span>
      </div>

      <div className="rs-values-bucket-bar">
        <span className="rs-values-bucket-k">{dir.valuesFiles.length} 个 values 文件</span>
        <WeightedResourcePills s={dir.stanzaSummary} />
      </div>
      {dir.stanzaSummary.weightedPartial ? (
        <p className="rs-right-muted rs-values-weighted-note">部分 cpu/memory 标量无法解析，已跳过对应加总项。</p>
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
        {repoCount > 1 && isActive ? <span className="rs-git-repo-card-badge">当前</span> : null}
      </div>
      <div className="rs-git-repo-card-sub" title={repo.repoRootPath}>
        {repo.repoRootPath}
      </div>
      {repo.fileReadFailed ? (
        <div className="rs-git-remote-muted">无法读取该仓库的 .git/config</div>
      ) : !repo.originUrl ? (
        <div className="rs-git-remote-muted">未配置 origin.url</div>
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

function renderProductStack({
  tier,
  title,
  dirs,
  repos,
  gitReposState,
  activeGitRepoRoot,
  totalGitRepoCount,
  valuesStatsState,
  noValuesAnywhere,
}: {
  tier: number;
  title: string;
  dirs: ValuesDirectoryStats[];
  repos: GitRepoResolved[];
  gitReposState: GitReposState;
  activeGitRepoRoot: string | null;
  totalGitRepoCount: number;
  valuesStatsState: ValuesStatsState;
  noValuesAnywhere: boolean;
}) {
  const valsKind = valuesStatsState.kind;
  const tierDirs = filterDirsByTier(dirs, tier);
  const tierRepos = filterReposByTier(repos, tier);

  const helmLoading = valsKind === "idle" || valsKind === "loading";
  const helmReady = valsKind === "ready";

  const showStack =
    tierRepos.length > 0 ||
    tierDirs.length > 0 ||
    (tier <= 1 && helmLoading) ||
    (tier === 2 && (tierRepos.length > 0 || tierDirs.length > 0));

  if (!showStack) return null;

  return (
    <section className="rs-product-stack" aria-label={title}>
      <h3 className="rs-product-stack-title">{title}</h3>

      <div className="rs-product-git-block">
        <h4 className="rs-product-subhead">Git 仓库</h4>
        {gitReposState.kind === "ready" && tierRepos.length > 0 ? (
          <ul className="rs-git-repo-list rs-git-repo-list--stacked">
            {tierRepos.map((repo) => (
              <GitRepoCard
                key={repo.repoRootPath}
                repo={repo}
                activeGitRepoRoot={activeGitRepoRoot}
                repoCount={totalGitRepoCount}
              />
            ))}
          </ul>
        ) : null}
        {gitReposState.kind === "ready" &&
        tierRepos.length === 0 &&
        tier <= 1 &&
        repos.length > 0 ? (
          <p className="rs-right-muted">本组路径下未匹配到 Git 仓库根（或 .git 未导入）。</p>
        ) : null}
      </div>

      <div className="rs-product-helm-block">
        <h4 className="rs-product-subhead">Workload 与资源</h4>
        {helmReady && tierDirs.length === 0 && !noValuesAnywhere ? (
          <p className="rs-right-muted">本组下未发现含 values*.yaml 的子目录。</p>
        ) : null}
        {helmReady && tierDirs.length > 0 ? (
          <ul className="rs-values-dir-list">
            {tierDirs.map((dir) => (
              <ValuesEnvCard key={dir.directoryPath} dir={dir} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function ResourceStatsRightPanel({
  gitReposState,
  activeGitRepoRoot,
  gitReposOrdered,
  valuesStatsState,
}: Props) {
  const dirs: ValuesDirectoryStats[] =
    valuesStatsState.kind === "ready" ? valuesStatsState.stats.directories : [];

  const valsKind = valuesStatsState.kind;
  const helmLoading = valsKind === "idle" || valsKind === "loading";
  const noValuesAnywhere = valsKind === "ready" && dirs.length === 0;
  const globalValuesReady = valsKind === "ready" && dirs.length > 0;

  return (
    <aside className="rs-right-panel" aria-label="Helm 与 Git 解析明细">
      <section className="left-panel-block grow rs-right-block rs-right-unified">
        <div className="rs-right-global-status" data-testid="resource-stats-git-remote">
          {gitReposState.kind === "loading" ? (
            <p className="rs-right-muted">正在解析 Git 远程地址…</p>
          ) : null}
          {gitReposState.kind === "none" ? (
            <p className="rs-right-muted">未发现 .git/config（或未导入该文件）</p>
          ) : null}
          {helmLoading ? (
            <p className="rs-right-muted">Helm 统计与上方「正在扫描」同步；完成后按组展示子目录。</p>
          ) : null}
          {valsKind === "error" ? (
            <p className="rs-right-muted" role="alert">
              统计失败：{valuesStatsState.message}
            </p>
          ) : null}
          {valsKind === "ready" && dirs.length === 0 ? (
            <p className="rs-right-muted">未发现 values*.yaml；导入 Helm 目录后将在对应组下展示。</p>
          ) : null}
        </div>

        {gitReposState.kind === "ready" && gitReposOrdered.length > 1 ? (
          <div className="rs-git-repo-meta rs-git-repo-meta--top">
            <span className="rs-git-repo-count-pill">{gitReposOrdered.length} 个 Git 仓库</span>
            {activeGitRepoRoot ? (
              <span className="rs-git-active-pill" title={activeGitRepoRoot}>
                与预览匹配：
                {gitReposOrdered.find((r) => r.repoRootPath === activeGitRepoRoot)?.repoFolderLabel ??
                  activeGitRepoRoot}
              </span>
            ) : (
              <span className="rs-git-remote-muted rs-git-active-hint">点击文件后会高亮匹配 origin</span>
            )}
          </div>
        ) : null}

        <div
          className="rs-product-stacks rs-values-wrap rs-values-wrap--detail"
          data-testid={globalValuesReady ? "resource-stats-values-stats" : undefined}
        >
          {renderProductStack({
            tier: 0,
            title: "master-data",
            dirs,
            repos: gitReposOrdered,
            gitReposState,
            activeGitRepoRoot,
            totalGitRepoCount: gitReposOrdered.length,
            valuesStatsState,
            noValuesAnywhere,
          })}
          {renderProductStack({
            tier: 1,
            title: "stock-physical",
            dirs,
            repos: gitReposOrdered,
            gitReposState,
            activeGitRepoRoot,
            totalGitRepoCount: gitReposOrdered.length,
            valuesStatsState,
            noValuesAnywhere,
          })}
          {renderProductStack({
            tier: 2,
            title: "其他",
            dirs,
            repos: gitReposOrdered,
            gitReposState,
            activeGitRepoRoot,
            totalGitRepoCount: gitReposOrdered.length,
            valuesStatsState,
            noValuesAnywhere,
          })}
        </div>
      </section>
    </aside>
  );
}
