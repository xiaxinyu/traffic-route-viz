import type { ReactNode } from "react";
import { formatCpuFromMilli, formatMemoryFromBytes } from "../../../domain/k8sQuantity";
import type { GitReposState, ValuesStatsState } from "../hooks/useLocalFolderScan";

type SummaryClusterProps = {
  valuesStatsState: ValuesStatsState;
  gitReposState: GitReposState;
  selectedPath: string | null;
};

function gitRepoCountDisplay(state: GitReposState): { text: string; title?: string } {
  switch (state.kind) {
    case "loading":
      return { text: "…", title: "Resolving Git repos" };
    case "none":
      return { text: "0", title: "No .git/config found (or no import yet)" };
    case "ready":
      return { text: String(state.repos.length) };
    default:
      return { text: "—", title: "Waiting for import" };
  }
}

/** 顶栏中部：状态、路径、Git/Chart/Workload 与加权资源合计（单条汇总区） */
export function ResourceStatsHeaderSummaryCluster({
  valuesStatsState,
  gitReposState,
  selectedPath,
}: SummaryClusterProps) {
  const repoDisp = gitRepoCountDisplay(gitReposState);
  const isReady = valuesStatsState.kind === "ready";
  const inProgress = valuesStatsState.kind === "idle" || valuesStatsState.kind === "loading";
  const isErr = valuesStatsState.kind === "error";
  const statusText = isErr ? "Error" : isReady ? "Ready" : inProgress ? "Scanning" : "—";

  let limitsBlock: ReactNode;
  if (valuesStatsState.kind === "error") {
    limitsBlock = (
      <p className="rs-header-resource-cluster__err rs-header-resource-cluster__err--inline" role="alert">
        Stats error: {valuesStatsState.message}
      </p>
    );
  } else if (inProgress) {
    limitsBlock = <span className="rs-header-resource-cluster__loading">Computing Helm totals…</span>;
  } else {
    const s = valuesStatsState.stats.summary;
    limitsBlock = (
      <div className="rs-header-resource-cluster__limits" aria-label="CPU and memory totals">
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
          <span className="rs-header-limit rs-header-limit--partial" title="Some scalars could not be parsed">
            (partial)
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rs-header-summary-cluster" data-testid="resource-stats-header-metrics" aria-label="Summary metrics">
      <div className="rs-header-summary-cluster__strip">
        <div className="rs-header-summary-cluster__group rs-header-summary-cluster__group--status">
          <span
            className={`rs-header-meta-pill rs-header-meta-pill--state rs-header-meta-pill--${isReady ? "ok" : inProgress ? "scan" : "err"}`}
          >
            Status {statusText}
          </span>
          {selectedPath ? (
            <span className="rs-header-meta-pill rs-header-meta-pill--path" title={selectedPath}>
              {selectedPath}
            </span>
          ) : null}
        </div>

        <div className="rs-header-summary-cluster__divider" aria-hidden="true" />

        <div className="rs-header-summary-cluster__group rs-header-summary-cluster__group--scale" aria-label="Git, Chart, and workload counts">
          <div className="rs-header-file-cluster__kpis">
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

        <div className="rs-header-summary-cluster__divider" aria-hidden="true" />

        <div className="rs-header-summary-cluster__group rs-header-summary-cluster__group--resources">{limitsBlock}</div>
      </div>
    </div>
  );
}
