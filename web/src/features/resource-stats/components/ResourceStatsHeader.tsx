import type { ReactNode } from "react";

type Props = {
  /** 顶栏左侧品牌区下方：规模与状态 */
  fileCluster?: ReactNode;
  /** 顶栏中部：加权资源合计 */
  centerMetrics: ReactNode;
};

export function ResourceStatsHeader({ fileCluster, centerMetrics }: Props) {
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
          </div>
          {fileCluster ? <div className="rs-stats-header__brand-slot">{fileCluster}</div> : null}
        </div>

        <div className="header-seg header-seg--metrics rs-stats-header__center" aria-label="加权资源合计">
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
