export const UI_SCALE_STORAGE_KEY = "trv.ui.scale";
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_STEP = 0.1;
export const UI_SCALE_DEFAULT = 1.08;

export const EDGE_LABELS_STORAGE_KEY = "trv.ui.edgeLabels";

export function clampUiScale(v: number): number {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(v.toFixed(2))));
}

export function readUiScale(): number {
  try {
    const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (!raw) return UI_SCALE_DEFAULT;
    const v = Number(raw);
    if (!Number.isFinite(v)) return UI_SCALE_DEFAULT;
    return clampUiScale(v);
  } catch {
    return UI_SCALE_DEFAULT;
  }
}

export function readEdgeLabelsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(EDGE_LABELS_STORAGE_KEY);
    if (raw === null) return true;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}
