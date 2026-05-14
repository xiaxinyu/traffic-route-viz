import { useMemo, useState, type ChangeEvent, type RefObject } from "react";

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
  onExpandAll: () => void;
  onCollapseToRoot: () => void;
  onSelectLeaf: (node: FileTreeNode) => void;
};

type TreeCounters = { dirs: number; files: number };

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function countTree(node: FileTreeNode): TreeCounters {
  if (!node.children?.length) {
    return { dirs: 0, files: node.file ? 1 : 0 };
  }
  let dirs = 1;
  let files = 0;
  for (const child of node.children) {
    const c = countTree(child);
    dirs += c.dirs;
    files += c.files;
  }
  return { dirs, files };
}

function filterTreeByQuery(root: FileTreeNode, query: string): FileTreeNode | null {
  if (!query) return root;
  const q = norm(query);

  const walk = (node: FileTreeNode): FileTreeNode | null => {
    const selfHit = norm(node.name).includes(q) || norm(node.relativePath).includes(q);
    if (!node.children?.length) {
      return selfHit ? node : null;
    }

    const children = node.children.map(walk).filter((c): c is FileTreeNode => !!c);
    if (selfHit || children.length > 0) {
      return {
        ...node,
        children,
      };
    }
    return null;
  };

  return walk(root);
}

function collectDirectoryPaths(root: FileTreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (node: FileTreeNode): void => {
    if (!node.children?.length) return;
    out.add(node.relativePath);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return out;
}

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
  onExpandAll,
  onCollapseToRoot,
  onSelectLeaf,
}: Props) {
  const [query, setQuery] = useState("");

  const hasTree = scan.phase === "ready" && !!displayRoot;

  const visibleRoot = useMemo(() => {
    if (!displayRoot) return null;
    return filterTreeByQuery(displayRoot, query);
  }, [displayRoot, query]);

  const counters = useMemo(() => {
    if (!visibleRoot) return { dirs: 0, files: 0 };
    return countTree(visibleRoot);
  }, [visibleRoot]);

  const effectiveExpanded = useMemo(() => {
    if (!visibleRoot) return expanded;
    if (!query.trim()) return expanded;
    return collectDirectoryPaths(visibleRoot);
  }, [visibleRoot, expanded, query]);

  return (
    <section className="left-panel-block grow rs-left-column">
      <div className="rs-tree-section">
        <div className="block-title-row rs-tree-head">
          <div className="block-title">目录树</div>
          <div className="rs-tree-head-pills" aria-label="目录树统计">
            <span className="status-pill">{counters.dirs} 目录</span>
            <span className="status-pill">{counters.files} 文件</span>
          </div>
        </div>

        <div className="rs-tree-toolbar">
          <label className="rs-tree-search" aria-label="搜索目录或文件">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文件/目录…"
            />
          </label>
          <div className="rs-tree-actions">
            <button type="button" className="btn-secondary rs-mini-btn" onClick={onExpandAll}>
              展开全部
            </button>
            <button type="button" className="btn-secondary rs-mini-btn" onClick={onCollapseToRoot}>
              收起
            </button>
          </div>
        </div>

        <div className="rs-tree-scroll">
          {hasTree && visibleRoot ? (
            <LocalFolderTreeView
              root={visibleRoot}
              expanded={effectiveExpanded}
              onToggle={onToggle}
              selectedPath={selectedPath}
              onSelectLeaf={onSelectLeaf}
              highlightTerm={query}
            />
          ) : hasTree && !visibleRoot ? (
            <div className="empty-box rs-tree-empty">未匹配到目录或文件，请调整搜索关键词。</div>
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
