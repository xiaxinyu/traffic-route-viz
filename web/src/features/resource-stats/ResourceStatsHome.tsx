import { ResourceStatsCodePanel } from "./components/ResourceStatsCodePanel";
import { ResourceStatsHeader } from "./components/ResourceStatsHeader";
import { ResourceStatsHeaderMetrics } from "./components/ResourceStatsHeaderMetrics";
import { ResourceStatsLeftPanel } from "./components/ResourceStatsLeftPanel";
import { ResourceStatsRightPanel } from "./components/ResourceStatsRightPanel";
import { useLocalFolderScan } from "./hooks/useLocalFolderScan";

export function ResourceStatsHome() {
  const {
    inputRef,
    scan,
    displayRoot,
    showDotGit,
    setShowDotGit,
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

  const hasTree = scan.phase === "ready" && !!displayRoot;

  return (
    <div className="app-shell" data-testid="resource-stats-home">
      <ResourceStatsHeader
        inputRef={inputRef}
        onInputChange={onInputChange}
        onPickFolder={pickFolder}
        showExpandControls={hasTree}
        onExpandAll={expandAllDirectories}
        onCollapseAll={collapseToRootOnly}
        centerMetrics={
          <ResourceStatsHeaderMetrics summaryLine={summaryLine} valuesStatsState={valuesStatsState} />
        }
      />

      {scan.phase === "error" && scan.errorMessage ? (
        <div className="parse-warning" role="alert">
          <strong>目录导入：</strong>
          <pre>{scan.errorMessage}</pre>
        </div>
      ) : null}

      <div className="main-body rs-stats-main">
        <aside className="left-panel rs-stats-left">
          <ResourceStatsLeftPanel
            scan={scan}
            displayRoot={displayRoot}
            showDotGit={showDotGit}
            onShowDotGitChange={setShowDotGit}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={togglePath}
            onSelectLeaf={selectLeaf}
          />
        </aside>

        <div className="flow-stage rs-stats-code-stage rs-stats-center">
          <ResourceStatsCodePanel selectedPath={selectedPath} preview={preview} />
        </div>

        <ResourceStatsRightPanel
          gitReposState={gitReposState}
          activeGitRepoRoot={activeGitRepoRoot}
          gitReposOrdered={gitReposOrdered}
          valuesStatsState={valuesStatsState}
        />
      </div>
    </div>
  );
}
