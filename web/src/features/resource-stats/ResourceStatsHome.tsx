import { ResourceStatsCodePanel } from "./components/ResourceStatsCodePanel";
import { ResourceStatsHeader } from "./components/ResourceStatsHeader";
import { ResourceStatsHeaderSummaryCluster } from "./components/ResourceStatsHeaderMetrics";
import { ResourceStatsLeftPanel } from "./components/ResourceStatsLeftPanel";
import { ResourceStatsRightPanel } from "./components/ResourceStatsRightPanel";
import { useLocalFolderScan } from "./hooks/useLocalFolderScan";

export function ResourceStatsHome() {
  const {
    inputRef,
    scan,
    displayRoot,
    expanded,
    selectedPath,
    preview,
    gitReposState,
    valuesStatsState,
    activeGitRepoRoot,
    gitReposOrdered,
    pickFolder,
    onInputChange,
    togglePath,
    expandAllDirectories,
    collapseToRootOnly,
    selectLeaf,
    summaryLine,
  } = useLocalFolderScan();

  return (
    <div className="app-shell" data-testid="resource-stats-home">
      <ResourceStatsHeader
        centerMetrics={
          summaryLine ? (
            <ResourceStatsHeaderSummaryCluster
              valuesStatsState={valuesStatsState}
              gitReposState={gitReposState}
              selectedPath={selectedPath}
            />
          ) : (
            <div className="rs-header-metrics rs-header-metrics--idle" data-testid="resource-stats-header-metrics">
              <span className="rs-header-metrics__hint">
                Pick a folder on the left to see summary metrics here
              </span>
            </div>
          )
        }
      />

      {scan.phase === "error" && scan.errorMessage ? (
        <div className="parse-warning" role="alert">
          <strong>Folder import:</strong>
          <pre>{scan.errorMessage}</pre>
        </div>
      ) : null}

      <div className="main-body rs-stats-main">
        <aside className="left-panel rs-stats-left">
          <ResourceStatsLeftPanel
            inputRef={inputRef}
            onInputChange={onInputChange}
            onPickFolder={pickFolder}
            scan={scan}
            displayRoot={displayRoot}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={togglePath}
            onExpandAll={expandAllDirectories}
            onCollapseToRoot={collapseToRootOnly}
            onSelectLeaf={selectLeaf}
          />
        </aside>

        <div className="flow-stage rs-stats-code-stage rs-stats-center">
          <div className="rs-stage-section-head">
            <div className="rs-stage-section-head__title-wrap">
              <h2 className="rs-stage-section-head__title">File preview</h2>
              <p className="rs-stage-section-head__desc">
                Select a file in the tree to inspect definitions and details.
              </p>
            </div>
            <span className="rs-stage-section-head__tag" title={selectedPath ?? "No file selected"}>
              {selectedPath ?? "No file selected"}
            </span>
          </div>
          <ResourceStatsCodePanel selectedPath={selectedPath} preview={preview} />
        </div>

        <ResourceStatsRightPanel
          gitReposState={gitReposState}
          activeGitRepoRoot={activeGitRepoRoot}
          gitReposOrdered={gitReposOrdered}
          valuesStatsState={valuesStatsState}
          selectedPath={selectedPath}
        />
      </div>
    </div>
  );
}
