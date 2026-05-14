import type { ChangeEvent, RefObject } from "react";

import type { FileTreeNode } from "../../../domain/fileTreeTypes";
import type { LocalFolderScanModel } from "../hooks/useLocalFolderScan";
import { LOCAL_FOLDER_COPY } from "../localFolderCopy";

import { LocalFolderToolbar } from "./LocalFolderToolbar";
import { LocalFolderTreeView } from "./LocalFolderTreeView";

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (ev: ChangeEvent<HTMLInputElement>) => void;
  onPickFolder: () => void;
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
  inputRef,
  onInputChange,
  onPickFolder,
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

  return (
    <section className="left-panel-block grow rs-left-column">
      <div className="rs-tree-section">
        <div className="block-title-row">
          <div className="block-title">目录树</div>
        </div>
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

        <div className="rs-tree-footer">
          <LocalFolderToolbar inputRef={inputRef} onInputChange={onInputChange} onPickFolder={onPickFolder} />
          <label className="rs-dotgit-toggle rs-dotgit-toggle--footer">
            <input
              type="checkbox"
              checked={showDotGit}
              onChange={(e) => onShowDotGitChange(e.target.checked)}
              data-testid="resource-stats-show-dotgit"
            />
            <span>显示 .git 目录</span>
          </label>
        </div>
      </div>
    </section>
  );
}
