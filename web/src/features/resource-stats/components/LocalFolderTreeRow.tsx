import type { CSSProperties } from "react";

import type { FileTreeNode } from "../../../domain/fileTreeTypes";

function IconFolderSmall() {
  return (
    <span className="local-folder-tree__glyph local-folder-tree__glyph--dir" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path
          d="M10 4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

function IconFileSmall() {
  return (
    <span className="local-folder-tree__glyph local-folder-tree__glyph--file" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6zm1 7V3.5L18.5 9H15z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

type Props = {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (relativePath: string) => void;
  selectedPath: string | null;
  onSelectLeaf?: (node: FileTreeNode) => void;
};

export function LocalFolderTreeRow({
  node,
  depth,
  expanded,
  onToggle,
  selectedPath,
  onSelectLeaf,
}: Props) {
  const isDir = !!node.children?.length;
  const key = node.relativePath;
  const open = expanded.has(key);
  const isActive = !isDir && selectedPath === key;

  return (
    <li className="local-folder-tree__item" style={{ "--depth": depth } as CSSProperties}>
      <div className="local-folder-tree__row">
        {isDir ? (
          <button
            type="button"
            className="local-folder-tree__toggle"
            aria-expanded={open}
            onClick={() => onToggle(key)}
            title={open ? "折叠" : "展开"}
          >
            <span className="local-folder-tree__chev" aria-hidden="true">
              {open ? "▾" : "▸"}
            </span>
            <IconFolderSmall />
            <span className="local-folder-tree__name">{node.name}</span>
          </button>
        ) : (
          <button
            type="button"
            className={`local-folder-tree__leaf${isActive ? " local-folder-tree__leaf--active" : ""}`}
            onClick={() => onSelectLeaf?.(node)}
            title="在右侧预览文件内容"
          >
            <span className="local-folder-tree__spacer" aria-hidden="true" />
            <IconFileSmall />
            <span className="local-folder-tree__name">{node.name}</span>
          </button>
        )}
      </div>
      {isDir && open ? (
        <ul className="local-folder-tree__children">
          {node.children!.map((ch) => (
            <LocalFolderTreeRow
              key={ch.relativePath}
              node={ch}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedPath={selectedPath}
              onSelectLeaf={onSelectLeaf}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
