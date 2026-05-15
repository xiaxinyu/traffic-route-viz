import type { ReactNode } from "react";

import { WorkbenchToolbarButton } from "../../../app/WorkbenchToolbarButton";

type Props = {
  /** 顶栏中部：汇总指标（状态、规模、资源合计） */
  centerMetrics: ReactNode;
};

export function ResourceStatsHeader({ centerMetrics }: Props) {
  return (
    <header className="app-header rs-stats-header">
      <div className="header-app-row rs-stats-header__row">
        <div className="header-seg header-seg--brand rs-stats-header__brand">
          <div className="header-title-wrap">
            <div className="header-title-row">
              <h1 title="Resource stats: local tree and file preview">Resource stats</h1>
            </div>
            <p className="rs-stats-header__slogan">Local tree, Git remotes, and Helm values</p>
          </div>
        </div>

        <div className="header-seg header-seg--metrics rs-stats-header__center" aria-label="Summary metrics">
          {centerMetrics}
        </div>

        <div className="header-seg header-seg--workbench rs-stats-header__workbench">
          <WorkbenchToolbarButton />
        </div>
      </div>
    </header>
  );
}
