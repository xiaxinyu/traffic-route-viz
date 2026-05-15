import type { ReactNode } from "react";

import type { ImportedYamlFile } from "../domain/mergeYamlBundles";

import { WorkbenchToolbarButton } from "./WorkbenchToolbarButton";

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
    statusStrip,
  } = props;

  const importTitle = importedFiles?.length
    ? `${importedFiles.length} file(s) imported` +
      (importedLinesSummary
        ? ` · ${importedLinesSummary.sumOfFileLines} lines across files · ${importedLinesSummary.mergedLineCount} lines merged`
        : "")
    : yamlTextStats.hasContent
      ? `Paste or import YAML; current buffer ${yamlTextStats.lineCount} lines (see YAML panel for docs/chars)`
      : "Paste YAML or import files/folders to merge and parse";

  const meta = importedFiles?.length ? (
    <>
      {importedFiles.length} file(s)
      {importedLinesSummary ? (
        <>
          {" "}
          · {importedLinesSummary.sumOfFileLines} lines total · merged{" "}
          {importedLinesSummary.mergedLineCount} lines
        </>
      ) : null}
    </>
  ) : yamlTextStats.hasContent ? (
    <>No files · buffer {yamlTextStats.lineCount} lines</>
  ) : (
    <>Drop files here or use Upload</>
  );

  return (
    <header className="app-header">
      <div className="header-app-row">
        <div className="header-seg header-seg--brand">
          <div className="header-title-wrap">
            <div className="header-title-row">
              <h1 title="Traffic Route Viz — import, parse, search, and export">
                Traffic Route Viz
              </h1>
            </div>
            <p className="header-tagline">
              Import YAML, explore ingress routes, and export the diagram
            </p>
          </div>
        </div>

        <section
          className="header-seg header-seg--import"
          aria-label="Input and data source"
          title={importTitle}
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={(ev) => {
            ev.preventDefault();
            void onDropImport(ev.dataTransfer);
          }}
        >
          <div className="header-import-copy">
            <span className="header-import-label">Input & source</span>
            <span className="header-import-meta">{meta}</span>
            <span className="header-import-hint">
              Drop YAML files or folders here — append, dedupe, and refresh
            </span>
          </div>
          <div
            data-testid="import-dropzone"
            className="header-import-drop-indicator"
            aria-hidden="true"
          >
            Drop to import
          </div>
          <div className="header-import-tools" role="group" aria-label="Import YAML">
            <button
              type="button"
              className="btn-primary btn-with-icon header-import-btn"
              onClick={onClickImportFiles}
              title="Import one or more YAML files"
              aria-label="Import files"
            >
              <Icon d={icons.docFile} className="trv-icon trv-icon--sm" />
              Files
            </button>
            <button
              type="button"
              className="btn-secondary btn-with-icon header-import-btn"
              onClick={onClickImportFolder}
              title="Import a folder (keeps relative paths)"
              aria-label="Import folder"
            >
              <Icon d={icons.folder} className="trv-icon trv-icon--sm" />
              Folder
            </button>
            {importedFiles?.length ? (
              <button
                type="button"
                className="btn-secondary btn-with-icon header-import-btn header-import-btn--danger"
                onClick={onClearImported}
                aria-label="Clear imports"
                title="Clear imported files and editor"
              >
                <Icon d={icons.trash} className="trv-icon trv-icon--sm" />
                Clear
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
                placeholder="Search nodes (name / host / path / service)"
                aria-label="Search nodes"
              />
            </div>

            <div className="header-tool-cluster" role="group" aria-label="Match and canvas">
              <div className="search-nav" role="navigation" aria-label="Match navigation">
                <button
                  type="button"
                  onClick={onPrevMatch}
                  disabled={!hasMatches}
                  aria-label="Previous match"
                  title="Previous match"
                >
                  <Icon d={icons.chevLeft} />
                </button>
                <button
                  type="button"
                  onClick={onNextMatch}
                  disabled={!hasMatches}
                  aria-label="Next match"
                  title="Next match"
                >
                  <Icon d={icons.chevRight} />
                </button>
                <span>{matchLabel}</span>
              </div>

              <button
                type="button"
                className="btn-primary btn-icon"
                onClick={onRefresh}
                title="Re-parse YAML and refresh the graph"
                aria-label="Refresh"
              >
                <Icon d={icons.refresh} />
              </button>

              <button
                type="button"
                className="btn-secondary btn-icon fit"
                onClick={onFit}
                title="Fit the graph to the viewport"
                aria-label="Fit view"
              >
                <Icon d={icons.fit} />
              </button>

              <div className="search-nav" role="group" aria-label="UI zoom">
                <button
                  type="button"
                  onClick={onZoomOut}
                  title="Zoom out sidebar and canvas"
                  aria-label="Zoom out"
                >
                  <Icon d={icons.minus} />
                </button>
                <button
                  type="button"
                  onClick={onZoomReset}
                  title="Reset sidebar and canvas zoom to 100%"
                  aria-label="Reset zoom"
                >
                  <span className="trv-icon-btn-text">{uiScalePct}%</span>
                </button>
                <button
                  type="button"
                  onClick={onZoomIn}
                  title="Zoom in sidebar and canvas"
                  aria-label="Zoom in"
                >
                  <Icon d={icons.plus} />
                </button>
              </div>
            </div>

            <div
              className="header-tool-cluster header-tool-cluster--status"
              role="group"
              aria-label="Metrics"
            >
              <button
                type="button"
                className={
                  statusOpen
                    ? "btn-secondary btn-icon metric btn-pill-active"
                    : "btn-secondary btn-icon metric"
                }
                onClick={toggleStatusOpen}
                title={statusOpen ? "Hide metrics" : "Show metrics"}
                aria-label="Metrics"
              >
                <Icon d={icons.chart} />
              </button>

              {statusOpen ? statusStrip : null}
            </div>
          </div>
        </div>

        <div className="header-seg header-seg--workbench">
          <WorkbenchToolbarButton />
        </div>
      </div>
    </header>
  );
}
