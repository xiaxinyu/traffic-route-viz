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
              <h1 title="资源统计：本地目录与文件预览">资源统计</h1>
            </div>
            <p className="rs-stats-header__slogan">本地目录、Git 与 Helm 资源一览</p>
          </div>
        </div>

        <div className="header-seg header-seg--metrics rs-stats-header__center" aria-label="资源统计汇总">
          {centerMetrics}
        </div>

        <div className="header-seg header-seg--workbench rs-stats-header__workbench">
          <WorkbenchToolbarButton />
        </div>
      </div>
    </header>
  );
}
