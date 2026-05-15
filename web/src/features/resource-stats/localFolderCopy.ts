/** UI copy for local folder import (decoupled for tests). */
export const LOCAL_FOLDER_COPY = {
  sectionTitle: "Local folder",
  sectionSub: "Pick a folder; the tree uses relative paths (in-browser only, no upload).",
  pickFolder: "Choose folder…",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  emptyHintPrefix: "For example, open a repo such as",
  emptyHintSuffix: "(with",
  emptyHintAnd: ",",
  emptyHintEnd: "subfolders).",
  summaryFiles: (n: number, rootName: string) => `${n} file(s) · root: ${rootName}`,
} as const;

export const LOCAL_FOLDER_ERROR = {
  noWebkitRelativePath:
    "This browser did not expose relative paths. Use Chrome, Edge, or Safari and pick a folder.",
} as const;
