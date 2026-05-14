import type { ChangeEvent, ReactNode, RefObject } from "react";

import { LocalFolderToolbar } from "./LocalFolderToolbar";

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (ev: ChangeEvent<HTMLInputElement>) => void;
  onPickFolder: () => void;
  showExpandControls: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** 顶栏中部：导入规模 + Values 汇总 */
  centerMetrics: ReactNode;
};

export function ResourceStatsHeader({
  inputRef,
  onInputChange,
  onPickFolder,
  showExpandControls,
  onExpandAll,
  onCollapseAll,
  centerMetrics,
}: Props) {
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
            <p className="header-tagline">本地目录预览；导入规模与 Helm 汇总在顶栏中部。</p>
          </div>
        </div>

        <div className="header-seg header-seg--metrics rs-stats-header__center" aria-label="导入与 Helm 汇总">
          {centerMetrics}
        </div>

        <div className="header-seg header-seg--tools rs-stats-header__actions" aria-label="资源统计操作">
          <LocalFolderToolbar
            inputRef={inputRef}
            onInputChange={onInputChange}
            onPickFolder={onPickFolder}
            showExpandControls={showExpandControls}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
          />
          <a className="btn-secondary btn-with-icon rs-stats-header__viz" href="#/viz">
            流量拓扑
          </a>
        </div>
      </div>
    </header>
  );
}
