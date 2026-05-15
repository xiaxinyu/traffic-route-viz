/** SVG paths (viewBox 0 0 24 24, fill currentColor). */
export const TRV_ICONS = {
  docFile: "M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6zm1 7V3.5L18.5 9H15z",
  folder: "M10 4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6z",
  trash: "M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z",
  refresh: "M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 12.65-5.65z",
  aiStar: "M12 17.27l6.18 3.73-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.45 4.73L5.82 21z",
  yamlLines:
    "M8 3h12v2H8V3zm0 5.5h12V11H8V8.5zm0 5.5h8v2H8V14zM4 4h2v2H4V4zm0 5.5h2V11H4V8.5zm0 5.5h2v2H4V14z",
  chevLeft: "M15 6l-6 6 6 6",
  chevRight: "M9 6l6 6-6 6",
  fit: "M4 7V4h3v2H6v1H4zm14-1V4h3v3h-2V6h-1zm1 15h2v-3h-2v1h-1v2h1zm-15 0v-3h2v1h1v2H4z",
  minus: "M19 13H5v-2h14v2z",
  plus: "M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z",
  chart: "M5 9h3v10H5V9zm5-4h3v14h-3V5zm5 7h3v7h-3v-7z",
  /** 工作台入口：2×2 模块栅格（与首页卡片语义一致） */
  workbench: "M4 4h7v7H4V4zm9 0h7v7h-7V4zm-9 9h7v7H4v-7zm9 0h7v7h-7v-7z",
} as const;
