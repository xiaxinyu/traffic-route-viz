import { useCallback, useEffect, useId, useRef, useState } from "react";

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
  const id = useId();
  const tipId = `${id}-route-merge-help`;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div className={`route-merge-help-wrap route-merge-help-wrap--${variant}`} ref={wrapRef}>
      <button
        type="button"
        className="route-merge-help-btn"
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
          className="route-merge-help-popover"
          role="dialog"
          aria-label="路由合并建议（v1）"
          onMouseDown={(e) => e.stopPropagation()}
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
            {analysis.recommendations.length === 0 ? (
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
