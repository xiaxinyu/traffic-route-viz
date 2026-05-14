import { parseGitRemoteForDisplay } from "../../../domain/gitRemoteDisplay";
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

function renderGitBlock(
  gitReposState: GitReposState,
  activeGitRepoRoot: string | null,
  gitReposOrdered: GitRepoResolved[],
) {
  return (
    <section className="left-panel-block compact rs-right-block rs-right-block--git">
      <div className="block-title-row">
        <div>
          <div className="block-title">Git 远程</div>
          <div className="block-subtitle">解析 .git/config 的 origin；与当前预览文件所在仓库对齐</div>
        </div>
      </div>
      <div className="rs-git-repo-block" data-testid="resource-stats-git-remote">
        {gitReposState.kind === "loading" ? (
          <span className="rs-git-remote-muted">正在解析 Git 远程地址…</span>
        ) : null}
        {gitReposState.kind === "none" ? (
          <span className="rs-git-remote-muted">未发现 .git/config（或未导入该文件）</span>
        ) : null}
        {gitReposState.kind === "ready" ? (
          <>
            {gitReposOrdered.length > 1 ? (
              <div className="rs-git-repo-meta">
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

            <ul className="rs-git-repo-list">
              {gitReposOrdered.map((repo) => {
                const isActive = !!activeGitRepoRoot && repo.repoRootPath === activeGitRepoRoot;
                const parts = repo.originUrl ? parseGitRemoteForDisplay(repo.originUrl) : null;
                return (
                  <li key={repo.repoRootPath} className={`rs-git-repo-card${isActive ? " rs-git-repo-card--active" : ""}`}>
                    <div className="rs-git-repo-card-head">
                      <span className="rs-git-repo-card-title">{repo.repoFolderLabel}</span>
                      {gitReposOrdered.length > 1 && isActive ? (
                        <span className="rs-git-repo-card-badge">当前</span>
                      ) : null}
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
                        {parts.host ? (
                          <div className="rs-git-repo-dl-row">
                            <dt>主机</dt>
                            <dd>{parts.host}</dd>
                          </div>
                        ) : null}
                        {parts.path ? (
                          <div className="rs-git-repo-dl-row">
                            <dt>仓库路径</dt>
                            <dd>{parts.path}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}

function renderValuesBlock(valuesStatsState: ValuesStatsState) {
  return (
    <section className="left-panel-block grow rs-right-block rs-right-block--values">
      <div className="block-title-row">
        <div>
          <div className="block-title">Helm / Values 明细</div>
          <div className="block-subtitle">按子目录列出 Chart 与 resources；合计数字见顶部导航中部</div>
        </div>
      </div>

      {valuesStatsState.kind === "idle" || valuesStatsState.kind === "loading" ? (
        <p className="rs-right-muted">与顶部「正在扫描」同步；完成后此处显示逐目录解析。</p>
      ) : null}

      {valuesStatsState.kind === "error" ? (
        <p className="rs-right-muted" role="alert">
          统计失败：{valuesStatsState.message}
        </p>
      ) : null}

      {valuesStatsState.kind === "ready" ? (
        <div className="rs-values-wrap rs-values-wrap--detail" data-testid="resource-stats-values-stats">
          {valuesStatsState.stats.directories.length === 0 ? (
            <p className="rs-right-muted">未发现 values*.yaml；导入 Helm 目录后会在此展示。</p>
          ) : (
            <ul className="rs-values-dir-list">
              {valuesStatsState.stats.directories.map((dir) => (
                <li key={dir.directoryPath} className="rs-values-dir-card">
                  <div className="rs-values-dir-head">
                    <strong title={dir.directoryPath}>{dir.directoryPath}</strong>
                    <span>{dir.resourceEntryCount} 个 resources</span>
                  </div>

                  {dir.chart ? (
                    <div className="rs-chart-meta">
                      <div className="rs-chart-meta-line">
                        <span className="rs-chart-meta-k">Chart</span>
                        <code>{dir.chart.relativePath}</code>
                      </div>
                      <div className="rs-chart-meta-line">
                        <span className="rs-chart-meta-k">Version</span>
                        <span>{dir.chart.chartVersion ?? "—"}</span>
                      </div>
                      {dir.chart.appVersion ? (
                        <div className="rs-chart-meta-line">
                          <span className="rs-chart-meta-k">AppVersion</span>
                          <span>{dir.chart.appVersion}</span>
                        </div>
                      ) : null}
                      {dir.chart.dependencies.length > 0 ? (
                        <ul className="rs-chart-deps-list">
                          {dir.chart.dependencies.map((dep, idx) => (
                            <li key={`${dep.name}-${idx}`}>
                              <span className="rs-chart-deps-name">{dep.name}</span>
                              <span className="rs-chart-deps-item">version: {dep.version ?? "—"}</span>
                              <span className="rs-chart-deps-item">repository: {dep.repository ?? "—"}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {dir.chart.parseError ? <p className="rs-right-muted">Chart 解析失败：{dir.chart.parseError}</p> : null}
                    </div>
                  ) : (
                    <p className="rs-right-muted">同目录未发现 Chart.yaml</p>
                  )}

                  <ul className="rs-values-file-list">
                    {dir.valuesFiles.map((vf) => (
                      <li key={vf.relativePath} className="rs-values-file-card">
                        <div className="rs-values-file-head">
                          <code title={vf.relativePath}>{vf.relativePath}</code>
                          <span>{vf.resourceEntries.length} 条</span>
                        </div>
                        {vf.parseError ? (
                          <p className="rs-right-muted">解析失败：{vf.parseError}</p>
                        ) : vf.resourceEntries.length === 0 ? (
                          <p className="rs-right-muted">未发现 resources 字段</p>
                        ) : (
                          <ul className="rs-values-entry-list">
                            {vf.resourceEntries.map((entry, idx) => (
                              <li key={`${entry.keyPath}-${idx}`}>
                                <div className="rs-values-entry-key">{entry.keyPath}</div>
                                <div className="rs-values-entry-vals">
                                  {entry.limitsCpu ? <span>limits.cpu: {entry.limitsCpu}</span> : null}
                                  {entry.limitsMemory ? <span>limits.memory: {entry.limitsMemory}</span> : null}
                                  {entry.requestsCpu ? <span>requests.cpu: {entry.requestsCpu}</span> : null}
                                  {entry.requestsMemory ? <span>requests.memory: {entry.requestsMemory}</span> : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ResourceStatsRightPanel({
  gitReposState,
  activeGitRepoRoot,
  gitReposOrdered,
  valuesStatsState,
}: Props) {
  return (
    <aside className="rs-right-panel" aria-label="Helm 与 Git 解析明细">
      {renderValuesBlock(valuesStatsState)}
      {renderGitBlock(gitReposState, activeGitRepoRoot, gitReposOrdered)}
    </aside>
  );
}
