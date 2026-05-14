import { useMemo } from "react";

import { findFileAtRelativePath } from "../../../domain/fileTreeQueries";
import type { FileTreeNode } from "../../../domain/fileTreeTypes";
import type { LocalFolderScanModel } from "../hooks/useLocalFolderScan";
import { LOCAL_FOLDER_COPY } from "../localFolderCopy";

import { LocalFolderTreeView } from "./LocalFolderTreeView";
import { ResourceStatsFileInspector } from "./ResourceStatsFileInspector";

type Props = {
  scan: LocalFolderScanModel;
  displayRoot: FileTreeNode | null;
  showDotGit: boolean;
  onShowDotGitChange: (v: boolean) => void;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (relativePath: string) => void;
  onSelectLeaf: (node: FileTreeNode) => void;
};

export function ResourceStatsLeftPanel({
  scan,
  displayRoot,
  showDotGit,
  onShowDotGitChange,
  expanded,
  selectedPath,
  onToggle,
  onSelectLeaf,
}: Props) {
  const hasTree = scan.phase === "ready" && !!displayRoot;

  const selectedFile = useMemo(() => {
    if (!scan.root || !selectedPath) return null;
    return findFileAtRelativePath(scan.root, selectedPath);
  }, [scan.root, selectedPath]);

  return (
    <section className="left-panel-block grow rs-left-column">
      <div className="rs-tree-section">
        <div className="block-title-row">
          <div>
            <div className="block-title">目录树</div>
            <div className="block-subtitle">单击文件预览；属性在下方。汇总在顶栏，Helm/Git 明细在右侧</div>
          </div>
        </div>
        <label className="rs-dotgit-toggle rs-dotgit-toggle--inline">
          <input
            type="checkbox"
            checked={showDotGit}
            onChange={(e) => onShowDotGitChange(e.target.checked)}
            data-testid="resource-stats-show-dotgit"
          />
          <span>显示 .git 目录</span>
        </label>
        <div className="rs-tree-scroll">
          {hasTree && displayRoot ? (
            <LocalFolderTreeView
              root={displayRoot}
              expanded={expanded}
              onToggle={onToggle}
              selectedPath={selectedPath}
              onSelectLeaf={onSelectLeaf}
            />
          ) : (
            <div className="empty-box rs-tree-empty">
              {LOCAL_FOLDER_COPY.emptyHintPrefix} <code className="local-folder__code">RTS-ROLLOUT</code>
              {LOCAL_FOLDER_COPY.emptyHintSuffix} <code className="local-folder__code">master-data</code>
              {LOCAL_FOLDER_COPY.emptyHintAnd}
              <code className="local-folder__code">stock-physical</code>
              {LOCAL_FOLDER_COPY.emptyHintEnd}
            </div>
          )}
        </div>
      </div>

      <ResourceStatsFileInspector selectedPath={selectedPath} file={selectedFile} />
    </section>
  );
}
