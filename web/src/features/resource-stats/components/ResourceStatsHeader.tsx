import type { ReactNode } from "react";

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
              <a className="header-portal-link" href="#/" title="返回工作台">
                工作台
              </a>
            </div>
            <p className="rs-stats-header__slogan">本地目录、Git 与 Helm 资源一览</p>
          </div>
        </div>

        <div className="header-seg header-seg--metrics rs-stats-header__center" aria-label="资源统计汇总">
          {centerMetrics}
        </div>

        <div className="header-seg header-seg--tools rs-stats-header__actions" aria-label="资源统计操作">
          <a className="btn-secondary btn-with-icon rs-stats-header__viz" href="#/viz">
            流量拓扑
          </a>
        </div>
      </div>
    </header>
  );
}
