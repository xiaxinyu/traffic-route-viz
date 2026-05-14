/** 由本地文件夹 `FileList` / `webkitRelativePath` 构建的目录树节点（领域模型）。 */
export type FileTreeNode = {
  name: string;
  relativePath: string;
  children?: FileTreeNode[];
  file?: File;
};
