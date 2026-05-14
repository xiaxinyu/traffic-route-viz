import type { ValuesStatsState } from "../hooks/useLocalFolderScan";

type Summary = { fileCount: number; rootName: string } | null;

type Props = {
  summaryLine: Summary;
  valuesStatsState: ValuesStatsState;
};

export function ResourceStatsHeaderMetrics({ summaryLine, valuesStatsState }: Props) {
  if (!summaryLine) {
    return (
      <div className="rs-header-metrics rs-header-metrics--idle" data-testid="resource-stats-header-metrics">
        <span className="rs-header-metrics__hint">导入文件夹后，此处显示文件规模与 Helm Values 汇总</span>
      </div>
    );
  }

  const { fileCount, rootName } = summaryLine;

  return (
    <div className="rs-header-metrics" data-testid="resource-stats-header-metrics">
      <div className="rs-header-metrics__row rs-header-metrics__row--import">
        <span className="rs-header-metrics__pill rs-header-metrics__pill--strong">{fileCount} 文件</span>
        <span className="rs-header-metrics__pill" title={`导入根：${rootName}`}>
          根 {rootName}
        </span>
      </div>

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
        <>
          <div className="rs-header-metrics__row rs-header-metrics__row--kpi" aria-label="Helm Values 汇总">
            <div className="rs-header-kpi">
              <span className="rs-header-kpi__k">目录</span>
              <strong className="rs-header-kpi__v">{valuesStatsState.stats.summary.directoryCount}</strong>
            </div>
            <div className="rs-header-kpi">
              <span className="rs-header-kpi__k">Values</span>
              <strong className="rs-header-kpi__v">{valuesStatsState.stats.summary.valuesFileCount}</strong>
            </div>
            <div className="rs-header-kpi">
              <span className="rs-header-kpi__k">resources</span>
              <strong className="rs-header-kpi__v">{valuesStatsState.stats.summary.resourceEntryCount}</strong>
            </div>
            <div className="rs-header-kpi">
              <span className="rs-header-kpi__k">Chart</span>
              <strong className="rs-header-kpi__v">{valuesStatsState.stats.summary.chartCount}</strong>
            </div>
          </div>
          <div className="rs-header-metrics__row rs-header-metrics__row--limits" aria-label="资源请求与上限出现次数">
            <span className="rs-header-limit">limits.cpu {valuesStatsState.stats.summary.limitsCpuCount}</span>
            <span className="rs-header-limit">limits.mem {valuesStatsState.stats.summary.limitsMemoryCount}</span>
            <span className="rs-header-limit">req.cpu {valuesStatsState.stats.summary.requestsCpuCount}</span>
            <span className="rs-header-limit">req.mem {valuesStatsState.stats.summary.requestsMemoryCount}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
