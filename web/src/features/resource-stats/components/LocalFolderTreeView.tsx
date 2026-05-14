import type { FileTreeNode } from "../../../domain/fileTreeTypes";

import { LocalFolderTreeRow } from "./LocalFolderTreeRow";

type Props = {
  root: FileTreeNode;
  expanded: Set<string>;
  onToggle: (relativePath: string) => void;
  selectedPath: string | null;
  onSelectLeaf: (node: FileTreeNode) => void;
};

export function LocalFolderTreeView({ root, expanded, onToggle, selectedPath, onSelectLeaf }: Props) {
  return (
    <div className="local-folder-tree">
      <ul className="local-folder-tree__root">
        <LocalFolderTreeRow
          node={root}
          depth={0}
          expanded={expanded}
          onToggle={onToggle}
          selectedPath={selectedPath}
          onSelectLeaf={onSelectLeaf}
        />
      </ul>
    </div>
  );
}
