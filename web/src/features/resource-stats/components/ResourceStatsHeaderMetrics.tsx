import { formatCpuFromMilli, formatMemoryFromBytes } from "../../../domain/k8sQuantity";
import type { GitReposState, ValuesStatsState } from "../hooks/useLocalFolderScan";

type Summary = { fileCount: number; rootName: string } | null;

type Props = {
  summaryLine: Summary;
  valuesStatsState: ValuesStatsState;
  gitReposState: GitReposState;
};

function gitRepoCountDisplay(state: GitReposState): { text: string; title?: string } {
  switch (state.kind) {
    case "loading":
      return { text: "…", title: "正在解析 Git 仓库" };
    case "none":
      return { text: "0", title: "未发现 .git/config（或未导入）" };
    case "ready":
      return { text: String(state.repos.length) };
    default:
      return { text: "—", title: "等待导入或解析" };
  }
}

export function ResourceStatsHeaderMetrics({ summaryLine, valuesStatsState, gitReposState }: Props) {
  if (!summaryLine) {
    return (
      <div className="rs-header-metrics rs-header-metrics--idle" data-testid="resource-stats-header-metrics">
        <span className="rs-header-metrics__hint">在左侧选择文件夹后，此处显示汇总指标</span>
      </div>
    );
  }

  const repoDisp = gitRepoCountDisplay(gitReposState);

  return (
    <div className="rs-header-metrics rs-header-metrics--anchored" data-testid="resource-stats-header-metrics">
      {valuesStatsState.kind === "idle" || valuesStatsState.kind === "loading" ? (
        <div className="rs-header-metrics__row rs-header-metrics__row--scan">
          <span className="rs-header-metrics__scan">正在扫描 values / Chart…</span>
        </div>
      ) : null}

      {valuesStatsState.kind === "error" ? (
        <div className="rs-header-metrics__row rs-header-metrics__row--scan">
          <span className="rs-header-metrics__err" role="alert">
            统计失败：{valuesStatsState.message}
          </span>
        </div>
      ) : null}

      {valuesStatsState.kind === "ready" ? (
        <div className="rs-header-metrics__split" aria-label="规模与资源统计">
          <div className="rs-header-metrics__split-left">
            <div className="rs-header-metrics__split-heading">资源文件</div>
            <div className="rs-header-metrics__kpi-strip" aria-label="Git、Chart 与 Workload 数量">
              <div className="rs-header-kpi" title={repoDisp.title}>
                <span className="rs-header-kpi__k">Git 仓库</span>
                <strong className="rs-header-kpi__v">{repoDisp.text}</strong>
              </div>
              <div className="rs-header-kpi">
                <span className="rs-header-kpi__k">Chart</span>
                <strong className="rs-header-kpi__v">{valuesStatsState.stats.summary.chartCount}</strong>
              </div>
              <div className="rs-header-kpi rs-header-kpi--accent">
                <span className="rs-header-kpi__k">Workload</span>
                <strong className="rs-header-kpi__v">{valuesStatsState.stats.summary.resourceEntryCount}</strong>
              </div>
            </div>
          </div>

          <div className="rs-header-metrics__split-right">
            <div className="rs-header-metrics__split-heading">资源统计</div>
            <div className="rs-header-metrics__limits-wrap" aria-label="CPU 与内存合计">
              <span className="rs-header-limit">
                req.cpu{" "}
                {valuesStatsState.stats.summary.weightedHasRequestsCpu
                  ? formatCpuFromMilli(valuesStatsState.stats.summary.weightedRequestsCpuMillisTotal)
                  : "—"}
              </span>
              <span className="rs-header-limit">
                limits.cpu{" "}
                {valuesStatsState.stats.summary.weightedHasLimitsCpu
                  ? formatCpuFromMilli(valuesStatsState.stats.summary.weightedLimitsCpuMillisTotal)
                  : "—"}
              </span>
              <span className="rs-header-limit">
                req.mem{" "}
                {valuesStatsState.stats.summary.weightedHasRequestsMemory
                  ? formatMemoryFromBytes(valuesStatsState.stats.summary.weightedRequestsMemoryBytesTotal)
                  : "—"}
              </span>
              <span className="rs-header-limit">
                limits.mem{" "}
                {valuesStatsState.stats.summary.weightedHasLimitsMemory
                  ? formatMemoryFromBytes(valuesStatsState.stats.summary.weightedLimitsMemoryBytesTotal)
                  : "—"}
              </span>
              {valuesStatsState.stats.summary.weightedPartial ? (
                <span className="rs-header-limit rs-header-limit--partial" title="部分标量无法解析为数值">
                  （部分未计入）
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
