import type { KeyboardEvent, ReactNode } from "react";

import type { ImportedYamlFile } from "../domain/mergeYamlBundles";

type ImportedLinesSummary = {
  sumOfFileLines: number;
  mergedLineCount: number;
};

type YamlTextStats = {
  hasContent: boolean;
  lineCount: number;
};

export function AppHeader(props: {
  Icon: (p: { d: string; className?: string }) => ReactNode;
  icons: {
    docFile: string;
    folder: string;
    trash: string;
    chevLeft: string;
    chevRight: string;
    refresh: string;
    fit: string;
    minus: string;
    plus: string;
    chart: string;
    logout: string;
  };
  importedFiles: ImportedYamlFile[] | null;
  importedLinesSummary: ImportedLinesSummary | null;
  yamlTextStats: YamlTextStats;
  onClickImportFiles: () => void;
  onClickImportFolder: () => void;
  onClearImported: () => void;
  onDropImport: (dt: DataTransfer) => void | Promise<void>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  matchLabel: string;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  hasMatches: boolean;
  onRefresh: () => void;
  onFit: () => void;
  uiScalePct: number;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  statusOpen: boolean;
  toggleStatusOpen: () => void;
  canLogout: boolean;
  onLogout: () => void;
  statusStrip: ReactNode;
}) {
  const {
    Icon,
    icons,
    importedFiles,
    importedLinesSummary,
    yamlTextStats,
    onClickImportFiles,
    onClickImportFolder,
    onClearImported,
    onDropImport,
    searchQuery,
    setSearchQuery,
    matchLabel,
    onPrevMatch,
    onNextMatch,
    hasMatches,
    onRefresh,
    onFit,
    uiScalePct,
    onZoomOut,
    onZoomReset,
    onZoomIn,
    statusOpen,
    toggleStatusOpen,
    canLogout,
    onLogout,
    statusStrip,
  } = props;

  const importTitle = importedFiles?.length
    ? `已导入 ${importedFiles.length} 个文件` +
      (importedLinesSummary
        ? `；各文件合计 ${importedLinesSummary.sumOfFileLines} 行，合并后 ${importedLinesSummary.mergedLineCount} 行`
        : "")
    : yamlTextStats.hasContent
      ? `可合并解析多文件；当前 YAML ${yamlTextStats.lineCount} 行（文档/字符见侧栏「YAML」）`
      : "可粘贴 YAML，或导入多文件/文件夹进行合并解析";

  const meta = importedFiles?.length ? (
    <>
      {importedFiles.length} 文件
      {importedLinesSummary ? (
        <>
          {" "}
          · 合计 {importedLinesSummary.sumOfFileLines} 行 · 合并 {importedLinesSummary.mergedLineCount} 行
        </>
      ) : null}
    </>
  ) : yamlTextStats.hasContent ? (
    <>未导入文件 · 当前 {yamlTextStats.lineCount} 行</>
  ) : (
    <>拖入或点选导入</>
  );

  const onDropzoneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClickImportFiles();
    }
  };

  return (
    <header className="app-header">
      <div className="header-app-row">
        <div className="header-seg header-seg--brand">
          <div className="header-title-wrap">
            <h1 title="专业化流量拓扑工作台：导入、解析、筛选、定位、导出一体化">
              Traffic Route Viz
            </h1>
            <p className="header-tagline">专业化流量拓扑工作台：导入、解析、筛选、定位、导出一体化</p>
          </div>
        </div>

        <section className="header-seg header-seg--import" aria-label="输入与数据源" title={importTitle}>
          <span className="header-import-meta">{meta}</span>
          <div
            data-testid="import-dropzone"
            className="import-dropzone import-dropzone--header import-dropzone--inline"
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault();
              void onDropImport(ev.dataTransfer);
            }}
            onClick={onClickImportFiles}
            onKeyDown={onDropzoneKeyDown}
            role="button"
            tabIndex={0}
          >
            <span className="dropzone-title">拖入 / 点击</span>
            <span className="dropzone-desc">追加 · 去重 · 刷新</span>
          </div>
          <div className="header-import-tools" role="group" aria-label="导入 YAML">
            <button
              type="button"
              className="btn-secondary btn-with-icon header-import-btn"
              onClick={onClickImportFiles}
              title="导入一个或多个 YAML 文件"
              aria-label="导入文件"
            >
              <Icon d={icons.docFile} className="trv-icon trv-icon--sm" />
              文件
            </button>
            <button
              type="button"
              className="btn-secondary btn-with-icon header-import-btn"
              onClick={onClickImportFolder}
              title="导入文件夹（保留相对路径）"
              aria-label="导入文件夹"
            >
              <Icon d={icons.folder} className="trv-icon trv-icon--sm" />
              文件夹
            </button>
            {importedFiles?.length ? (
              <button
                type="button"
                className="btn-secondary btn-with-icon header-import-btn header-import-btn--danger"
                onClick={onClearImported}
                aria-label="清空已导入"
                title="清空已导入与编辑区"
              >
                <Icon d={icons.trash} className="trv-icon trv-icon--sm" />
                清空
              </button>
            ) : null}
          </div>
        </section>

        <div className="header-seg header-seg--tools">
          <div className="header-main-controls">
            <div className="header-tool-cluster header-tool-cluster--search">
              <input
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onNextMatch();
                }}
                placeholder="搜索节点（name / host / path / service）"
                aria-label="搜索节点"
              />
            </div>

            <div className="header-tool-cluster" role="group" aria-label="匹配与画布">
              <div className="search-nav" role="navigation" aria-label="聚焦导航">
                <button
                  type="button"
                  onClick={onPrevMatch}
                  disabled={!hasMatches}
                  aria-label="上一个"
                  title="上一个"
                >
                  <Icon d={icons.chevLeft} />
                </button>
                <button
                  type="button"
                  onClick={onNextMatch}
                  disabled={!hasMatches}
                  aria-label="下一个"
                  title="下一个"
                >
                  <Icon d={icons.chevRight} />
                </button>
                <span>{matchLabel}</span>
              </div>

              <button
                type="button"
                className="btn-primary btn-icon"
                onClick={onRefresh}
                title="重新解析 YAML 并刷新拓扑"
                aria-label="刷新"
              >
                <Icon d={icons.refresh} />
              </button>

              <button
                type="button"
                className="btn-secondary btn-icon fit"
                onClick={onFit}
                title="将拓扑重新适配到当前画布"
                aria-label="适配"
              >
                <Icon d={icons.fit} />
              </button>

              <div className="search-nav" role="group" aria-label="全局缩放控制">
                <button type="button" onClick={onZoomOut} title="缩小侧栏与拓扑（含文字）" aria-label="缩小">
                  <Icon d={icons.minus} />
                </button>
                <button type="button" onClick={onZoomReset} title="将侧栏与拓扑缩放设为 100%" aria-label="重置缩放">
                  <span className="trv-icon-btn-text">{uiScalePct}%</span>
                </button>
                <button type="button" onClick={onZoomIn} title="放大侧栏与拓扑（含文字）" aria-label="放大">
                  <Icon d={icons.plus} />
                </button>
              </div>
            </div>

            <div className="header-tool-cluster header-tool-cluster--status" role="group" aria-label="指标与账号">
              <button
                type="button"
                className={statusOpen ? "btn-secondary btn-icon metric btn-pill-active" : "btn-secondary btn-icon metric"}
                onClick={toggleStatusOpen}
                title={statusOpen ? "收起指标" : "展开指标"}
                aria-label="指标"
              >
                <Icon d={icons.chart} />
              </button>

              {canLogout ? (
                <button type="button" className="btn-secondary btn-icon" onClick={onLogout} title="退出登录" aria-label="退出">
                  <Icon d={icons.logout} />
                </button>
              ) : null}

              {statusOpen ? statusStrip : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

