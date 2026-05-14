import { useMemo } from "react";

import { findFileAtRelativePath } from "../../domain/fileTreeQueries";
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

  const selectedFile = useMemo(() => {
    if (scan.phase !== "ready" || !scan.root || !selectedPath) return null;
    return findFileAtRelativePath(scan.root, selectedPath)?.file ?? null;
  }, [scan.phase, scan.root, selectedPath]);

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
              <span className="rs-header-metrics__hint">在左侧选择文件夹后，此处显示汇总指标</span>
            </div>
          )
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
            inputRef={inputRef}
            onInputChange={onInputChange}
            onPickFolder={pickFolder}
            scan={scan}
            displayRoot={displayRoot}
            showDotGit={showDotGit}
            onShowDotGitChange={setShowDotGit}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={togglePath}
            onExpandAll={expandAllDirectories}
            onCollapseToRoot={collapseToRootOnly}
            onSelectLeaf={selectLeaf}
          />
        </aside>

        <div className="flow-stage rs-stats-code-stage rs-stats-center">
          <ResourceStatsCodePanel selectedPath={selectedPath} selectedFile={selectedFile} preview={preview} />
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
