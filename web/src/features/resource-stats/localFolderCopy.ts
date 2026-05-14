/** 文案与错误码：与 UI 解耦，便于单测与复用。 */
export const LOCAL_FOLDER_COPY = {
  sectionTitle: "本地目录",
  sectionSub:
    "选择本机文件夹，按相对路径生成树（仅浏览器内处理，不上传）。",
  pickFolder: "选择文件夹…",
  expandAll: "全部展开",
  collapseAll: "全部折叠",
  emptyHintPrefix: "例如选择本机",
  emptyHintSuffix: "工程目录（含",
  emptyHintAnd: "、",
  emptyHintEnd: "等子目录）。",
  summaryFiles: (n: number, rootName: string) => `${n} 个文件 · 根：${rootName}`,
} as const;

export const LOCAL_FOLDER_ERROR = {
  noWebkitRelativePath:
    "当前浏览器未提供相对路径信息，请使用 Chrome / Edge / Safari 等并选择「文件夹」。",
} as const;
