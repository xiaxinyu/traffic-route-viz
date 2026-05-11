import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { RouteMergeAnalysis } from "./routeMergeTypes";

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type RouteMergeHelpTriggerProps = {
  analysis: RouteMergeAnalysis;
  /** Defaults to compact for file rows */
  variant?: "compact" | "toolbar";
};

export function RouteMergeHelpTrigger(props: RouteMergeHelpTriggerProps) {
  const { analysis, variant = "compact" } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const tipId = `${id}-route-merge-help`;
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const clamp = useCallback((v: number, min: number, max: number) => Math.max(min, Math.min(max, v)), []);

  const computePos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targetWidth = Math.min(520, Math.floor(vw * 0.92));
    const margin = 10;
    const left =
      variant === "toolbar"
        ? clamp(r.left, margin, vw - targetWidth - margin)
        : clamp(r.right - targetWidth, margin, vw - targetWidth - margin);
    const top = clamp(r.bottom + 8, margin, vh - 120);
    setPos({ left, top, width: targetWidth });
  }, [clamp, variant]);

  const hasContent = useMemo(() => analysis.recommendations.length > 0, [analysis.recommendations.length]);

  useEffect(() => {
    if (!open) return;
    computePos();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const onWin = () => computePos();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, close, computePos]);

  return (
    <div className={`route-merge-help-wrap route-merge-help-wrap--${variant}`} ref={wrapRef}>
      <button
        type="button"
        className="route-merge-help-btn"
        ref={btnRef}
        aria-label="路由合并建议（v1）说明"
        aria-expanded={open}
        aria-controls={tipId}
        title="路由合并建议（v1）"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? (
        <div
          id={tipId}
          className="route-merge-help-popover route-merge-help-popover--fixed"
          role="dialog"
          aria-label="路由合并建议（v1）"
          onMouseDown={(e) => e.stopPropagation()}
          style={
            pos
              ? { position: "fixed", left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px` }
              : undefined
          }
        >
          <div className="route-merge-help-popover-head">
            <span className="route-merge-help-popover-title">路由合并建议（v1）</span>
            <button type="button" className="route-merge-help-close" onClick={close} aria-label="关闭">
              ×
            </button>
          </div>
          <div className="route-merge-help-popover-body">
            <p className="route-merge-help-reminder">{analysis.v1RulesReminder}</p>
            <p className="route-merge-help-hint">dry-run；不修改编辑器；规则引擎仅分析与导出候选。</p>
            {!hasContent ? (
              <p className="route-merge-help-empty">当前无规则引擎条目。</p>
            ) : (
              <ul className="route-merge-help-list">
                {analysis.recommendations.map((r) => (
                  <li key={r.id} className={`route-merge-item level-${r.level} route-merge-help-item`}>
                    <div className="route-merge-item-head">
                      <span className="route-merge-badge">{r.level}</span>
                      <span className="route-merge-kind">{r.kind}</span>
                      <span className="route-merge-help-delta">Δ行≈{r.estimatedLineDelta}</span>
                    </div>
                    <div className="route-merge-rationale">{r.rationale}</div>
                    {r.resourceRefs.length ? (
                      <div className="route-merge-refs">{r.resourceRefs.join(" · ")}</div>
                    ) : null}
                    {r.warnings.length ? (
                      <ul className="route-merge-warn">
                        {r.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                    {r.candidateYaml ? (
                      <div className="route-merge-candidate-actions">
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => void navigator.clipboard.writeText(r.candidateYaml!)}
                        >
                          复制候选 YAML
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() =>
                            downloadText(`route-merge-${r.id}.yaml`, r.candidateYaml!, "text/yaml;charset=utf-8")
                          }
                        >
                          下载
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
