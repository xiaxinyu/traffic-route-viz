import { useMemo, useState, type ChangeEvent, type RefObject } from "react";

import { TRV_ICONS } from "../../../app/trvIcons";
import type { FileTreeNode } from "../../../domain/fileTreeTypes";
import type { LocalFolderScanModel } from "../hooks/useLocalFolderScan";

import { LocalFolderToolbar } from "./LocalFolderToolbar";
import { LocalFolderTreeView } from "./LocalFolderTreeView";

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (ev: ChangeEvent<HTMLInputElement>) => void;
  onPickFolder: () => void;
  scan: LocalFolderScanModel;
  displayRoot: FileTreeNode | null;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (relativePath: string) => void;
  onExpandAll: () => void;
  onCollapseToRoot: () => void;
  onSelectLeaf: (node: FileTreeNode) => void;
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="trv-icon trv-icon--sm">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function norm(value: string): string {
  return value.trim().toLowerCase();
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

  const effectiveExpanded = useMemo(() => {
    if (!visibleRoot) return expanded;
    if (!query.trim()) return expanded;
    return collectDirectoryPaths(visibleRoot);
  }, [visibleRoot, expanded, query]);

  return (
    <section className="left-panel-block grow rs-left-column">
      <div className="rs-tree-section">
        <div className="block-title-row rs-tree-head">
          <div className="block-title">Directory tree</div>
          <div className="rs-tree-head-actions">
            <LocalFolderToolbar
              inputRef={inputRef}
              onInputChange={onInputChange}
              onPickFolder={onPickFolder}
              compact
            />
          </div>
        </div>

        <div className="rs-tree-toolbar">
          <label className="rs-tree-search" aria-label="Search files or folders">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
            />
          </label>
          <div className="rs-tree-actions">
            <button
              type="button"
              className="btn-secondary rs-icon-btn"
              onClick={onExpandAll}
              title="Expand all"
              aria-label="Expand all"
            >
              <Icon d={TRV_ICONS.plus} />
            </button>
            <button
              type="button"
              className="btn-secondary rs-icon-btn"
              onClick={onCollapseToRoot}
              title="Collapse to root"
              aria-label="Collapse to root"
            >
              <Icon d={TRV_ICONS.minus} />
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
            <div className="empty-box rs-tree-empty">No matches. Try another search.</div>
          ) : (
            <div className="empty-box rs-tree-empty rs-tree-empty--minimal">
              Choose a folder to load the tree
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
