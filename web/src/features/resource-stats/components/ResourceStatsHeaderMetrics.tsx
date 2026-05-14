import { formatCpuFromMilli, formatMemoryFromBytes } from "../../../domain/k8sQuantity";
import type { GitReposState, ValuesStatsState } from "../hooks/useLocalFolderScan";

type FileClusterProps = {
  valuesStatsState: ValuesStatsState;
  gitReposState: GitReposState;
  selectedPath: string | null;
};

type ResourceClusterProps = {
  valuesStatsState: ValuesStatsState;
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

/** 顶栏左侧：状态 + 当前路径 + Git / Chart / Workload 规模 */
export function ResourceStatsHeaderFileCluster({
  valuesStatsState,
  gitReposState,
  selectedPath,
}: FileClusterProps) {
  const repoDisp = gitRepoCountDisplay(gitReposState);
  const isReady = valuesStatsState.kind === "ready";
  const inProgress = valuesStatsState.kind === "idle" || valuesStatsState.kind === "loading";
  const isErr = valuesStatsState.kind === "error";
  const statusText = isErr ? "异常" : isReady ? "就绪" : inProgress ? "扫描中" : "—";

  return (
    <div className="rs-header-file-cluster" data-testid="resource-stats-header-file-cluster">
      <div className="rs-header-file-cluster__top">
        <span
          className={`rs-header-meta-pill rs-header-meta-pill--state rs-header-meta-pill--${isReady ? "ok" : inProgress ? "scan" : "err"}`}
        >
          状态 {statusText}
        </span>
        {selectedPath ? (
          <span className="rs-header-meta-pill rs-header-meta-pill--path" title={selectedPath}>
            {selectedPath}
          </span>
        ) : null}
      </div>
      <div className="rs-header-file-cluster__kpis" aria-label="Git、Chart 与 Workload 数量">
        <div className="rs-header-kpi rs-header-kpi--dense" title={repoDisp.title}>
          <span className="rs-header-kpi__k">Git</span>
          <strong className="rs-header-kpi__v">{repoDisp.text}</strong>
        </div>
        <div className="rs-header-kpi rs-header-kpi--dense">
          <span className="rs-header-kpi__k">Chart</span>
          <strong className="rs-header-kpi__v">{isReady ? valuesStatsState.stats.summary.chartCount : "—"}</strong>
        </div>
        <div className="rs-header-kpi rs-header-kpi--dense rs-header-kpi--accent">
          <span className="rs-header-kpi__k">Workload</span>
          <strong className="rs-header-kpi__v">
            {isReady ? valuesStatsState.stats.summary.resourceEntryCount : "—"}
          </strong>
        </div>
      </div>
    </div>
  );
}

/** 顶栏中部：按副本加权后的 CPU / 内存合计 */
export function ResourceStatsHeaderResourceCluster({ valuesStatsState }: ResourceClusterProps) {
  if (valuesStatsState.kind === "error") {
    return (
      <div className="rs-header-resource-cluster" data-testid="resource-stats-header-metrics">
        <p className="rs-header-resource-cluster__err" role="alert">
          统计失败：{valuesStatsState.message}
        </p>
      </div>
    );
  }

  const isReady = valuesStatsState.kind === "ready";
  const loading = valuesStatsState.kind === "idle" || valuesStatsState.kind === "loading";

  if (loading) {
    return (
      <div className="rs-header-resource-cluster rs-header-resource-cluster--loading" data-testid="resource-stats-header-metrics">
        <span className="rs-header-resource-cluster__loading">Helm 汇总计算中…</span>
      </div>
    );
  }

  const s = valuesStatsState.stats.summary;

  return (
    <div className="rs-header-resource-cluster" data-testid="resource-stats-header-metrics" aria-label="资源统计">
      <div className="rs-header-resource-cluster__limits" aria-label="CPU 与内存合计">
        <span className="rs-header-limit">
          req.cpu {isReady && s.weightedHasRequestsCpu ? formatCpuFromMilli(s.weightedRequestsCpuMillisTotal) : "—"}
        </span>
        <span className="rs-header-limit">
          limits.cpu {isReady && s.weightedHasLimitsCpu ? formatCpuFromMilli(s.weightedLimitsCpuMillisTotal) : "—"}
        </span>
        <span className="rs-header-limit">
          req.mem {isReady && s.weightedHasRequestsMemory ? formatMemoryFromBytes(s.weightedRequestsMemoryBytesTotal) : "—"}
        </span>
        <span className="rs-header-limit">
          limits.mem {isReady && s.weightedHasLimitsMemory ? formatMemoryFromBytes(s.weightedLimitsMemoryBytesTotal) : "—"}
        </span>
        {isReady && s.weightedPartial ? (
          <span className="rs-header-limit rs-header-limit--partial" title="部分标量无法解析为数值">
            （部分未计入）
          </span>
        ) : null}
      </div>
    </div>
  );
}
