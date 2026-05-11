import { useEffect, useMemo, useState } from "react";

import { buildFlowGraph } from "../../domain/buildGraph";
import { parseK8sYaml } from "../../domain/k8sParser";
import type { RouteMergeAiPayload } from "./routeMergeTypes";

type DiffKind = "equal" | "add" | "delete" | "modify";

type DiffRow = {
  kind: DiffKind;
  oldLineNo: number | null;
  newLineNo: number | null;
  oldText: string;
  newText: string;
};

type DiffDisplayRow =
  | DiffRow
  | {
      kind: "skip";
      oldLabel: string;
      newLabel: string;
      count: number;
    };

type DiffOp =
  | { kind: "equal"; oldIndex: number; newIndex: number }
  | { kind: "delete"; oldIndex: number }
  | { kind: "add"; newIndex: number };

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function validateYamlForGraph(yaml: string): { ok: boolean; detail: string } {
  const trimmed = yaml.trim();
  if (!trimmed) return { ok: true, detail: "空内容" };
  try {
    const p = parseK8sYaml(trimmed);
    buildFlowGraph(p);
    const warn = p.errors.length ? `（解析告警 ${p.errors.length} 条）` : "";
    return { ok: true, detail: `可解析并构图 ${warn}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function splitYamlLines(text: string): string[] {
  if (!text) return [""];
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function countYamlLines(text: string): number {
  return splitYamlLines(text).length;
}

function compactList(items: string[]): string[] {
  return items.map((x) => x.trim()).filter(Boolean);
}

function buildFallbackDiffRows(oldLines: string[], newLines: string[]): DiffRow[] {
  const max = Math.max(oldLines.length, newLines.length);
  const rows: DiffRow[] = [];
  for (let i = 0; i < max; i += 1) {
    const hasOld = i < oldLines.length;
    const hasNew = i < newLines.length;
    const oldText = hasOld ? oldLines[i] : "";
    const newText = hasNew ? newLines[i] : "";
    rows.push({
      kind:
        hasOld && hasNew ? (oldText === newText ? "equal" : "modify") : hasOld ? "delete" : "add",
      oldLineNo: hasOld ? i + 1 : null,
      newLineNo: hasNew ? i + 1 : null,
      oldText,
      newText,
    });
  }
  return rows;
}

function pairDiffOps(ops: DiffOp[], oldLines: string[], newLines: string[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    const next = ops[i + 1];
    if (op.kind === "delete" && next?.kind === "add") {
      rows.push({
        kind: "modify",
        oldLineNo: op.oldIndex + 1,
        newLineNo: next.newIndex + 1,
        oldText: oldLines[op.oldIndex],
        newText: newLines[next.newIndex],
      });
      i += 1;
      continue;
    }
    if (op.kind === "add" && next?.kind === "delete") {
      rows.push({
        kind: "modify",
        oldLineNo: next.oldIndex + 1,
        newLineNo: op.newIndex + 1,
        oldText: oldLines[next.oldIndex],
        newText: newLines[op.newIndex],
      });
      i += 1;
      continue;
    }
    if (op.kind === "equal") {
      rows.push({
        kind: "equal",
        oldLineNo: op.oldIndex + 1,
        newLineNo: op.newIndex + 1,
        oldText: oldLines[op.oldIndex],
        newText: newLines[op.newIndex],
      });
    } else if (op.kind === "delete") {
      rows.push({
        kind: "delete",
        oldLineNo: op.oldIndex + 1,
        newLineNo: null,
        oldText: oldLines[op.oldIndex],
        newText: "",
      });
    } else {
      rows.push({
        kind: "add",
        oldLineNo: null,
        newLineNo: op.newIndex + 1,
        oldText: "",
        newText: newLines[op.newIndex],
      });
    }
  }
  return rows;
}

function buildYamlDiffRows(oldYaml: string, newYaml: string): DiffRow[] {
  const oldLines = splitYamlLines(oldYaml);
  const newLines = splitYamlLines(newYaml);
  const cellCount = (oldLines.length + 1) * (newLines.length + 1);
  if (cellCount > 1_200_000) return buildFallbackDiffRows(oldLines, newLines);

  const width = newLines.length + 1;
  const dp = new Uint32Array((oldLines.length + 1) * width);
  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      const idx = i * width + j;
      dp[idx] =
        oldLines[i] === newLines[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: "equal", oldIndex: i, newIndex: j });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ kind: "delete", oldIndex: i });
      i += 1;
    } else {
      ops.push({ kind: "add", newIndex: j });
      j += 1;
    }
  }
  while (i < oldLines.length) {
    ops.push({ kind: "delete", oldIndex: i });
    i += 1;
  }
  while (j < newLines.length) {
    ops.push({ kind: "add", newIndex: j });
    j += 1;
  }

  return pairDiffOps(ops, oldLines, newLines);
}

function lineRangeLabel(start: number | null, end: number | null): string {
  if (start === null || end === null) return "";
  return start === end ? String(start) : `${start}-${end}`;
}

function buildDiffDisplayRows(rows: DiffRow[]): { rows: DiffDisplayRow[]; hidden: number } {
  const context = 4;
  const maxRenderedRows = 2_400;
  const out: DiffDisplayRow[] = [];
  let hidden = 0;

  for (let i = 0; i < rows.length; ) {
    if (rows[i].kind !== "equal") {
      out.push(rows[i]);
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < rows.length && rows[end].kind === "equal") end += 1;
    const run = rows.slice(i, end);
    if (run.length <= context * 2 + 1) {
      out.push(...run);
    } else {
      const skipped = run.slice(context, run.length - context);
      out.push(...run.slice(0, context));
      out.push({
        kind: "skip",
        oldLabel: lineRangeLabel(skipped[0].oldLineNo, skipped[skipped.length - 1].oldLineNo),
        newLabel: lineRangeLabel(skipped[0].newLineNo, skipped[skipped.length - 1].newLineNo),
        count: skipped.length,
      });
      out.push(...run.slice(-context));
      hidden += skipped.length;
    }
    i = end;
  }

  if (out.length <= maxRenderedRows) return { rows: out, hidden };

  const headCount = Math.floor(maxRenderedRows * 0.6);
  const tailCount = maxRenderedRows - headCount;
  const omitted = out.length - maxRenderedRows;
  return {
    rows: [
      ...out.slice(0, headCount),
      { kind: "skip", oldLabel: "", newLabel: "", count: omitted },
      ...out.slice(-tailCount),
    ],
    hidden: hidden + omitted,
  };
}

export type RouteMergeAiModalProps = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  payload: RouteMergeAiPayload | null;
  error: string | null;
  scopeLabel: string | null;
  sourceYaml: string;
  previewUserContent: string;
  onConfirmRun: () => void;
};

export function RouteMergeAiModal(props: RouteMergeAiModalProps) {
  const {
    open,
    onClose,
    busy,
    payload,
    error,
    scopeLabel,
    sourceYaml,
    previewUserContent,
    onConfirmRun,
  } = props;
  const [activeYamlTab, setActiveYamlTab] = useState<"yaml" | "diff">("yaml");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const aiYamlCheck = useMemo(() => {
    if (!payload?.optimizedYaml?.trim()) return null;
    return validateYamlForGraph(payload.optimizedYaml);
  }, [payload]);

  const optimizedYaml = payload?.optimizedYaml ?? "";
  const hasOptimizedYaml = optimizedYaml.trim().length > 0;
  const diffRows = useMemo(
    () => (hasOptimizedYaml ? buildYamlDiffRows(sourceYaml, optimizedYaml) : []),
    [hasOptimizedYaml, sourceYaml, optimizedYaml],
  );
  const diffDisplay = useMemo(() => buildDiffDisplayRows(diffRows), [diffRows]);
  const sourceLineCount = useMemo(() => countYamlLines(sourceYaml), [sourceYaml]);
  const optimizedLineCount = useMemo(() => countYamlLines(optimizedYaml), [optimizedYaml]);
  const previewLines = useMemo(() => splitYamlLines(previewUserContent), [previewUserContent]);
  const sourceLines = useMemo(() => splitYamlLines(sourceYaml), [sourceYaml]);
  const optimizedLines = useMemo(() => splitYamlLines(optimizedYaml), [optimizedYaml]);
  const optimizationPlan = useMemo(
    () => compactList(payload?.optimizationPlan ?? []),
    [payload?.optimizationPlan],
  );
  const changeSummary = useMemo(
    () => compactList(payload?.changeSummary ?? []),
    [payload?.changeSummary],
  );
  const validationChecklist = useMemo(
    () => compactList(payload?.validationChecklist ?? []),
    [payload?.validationChecklist],
  );
  const lineDigits = useMemo(
    () => String(Math.max(sourceLines.length, optimizedLines.length, 1)).length,
    [sourceLines.length, optimizedLines.length],
  );
  const previewLineDigits = useMemo(
    () => String(Math.max(previewLines.length, 1)).length,
    [previewLines.length],
  );

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop (click-outside to close), same pattern as YAML popout
    <div
      className="trv-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="trv-modal route-merge-ai-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-merge-ai-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="trv-modal-header">
          <div className="trv-modal-title" id="route-merge-ai-modal-title">
            路由合并 · AI 输出
          </div>
          <div className="trv-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>

        <div className="route-merge-ai-modal-body">
          {scopeLabel ? <div className="route-merge-ai-modal-scope">{scopeLabel}</div> : null}

          {busy ? <div className="route-merge-ai-modal-status">AI 请求中…</div> : null}

          {error ? (
            <div className="route-merge-error route-merge-ai-modal-error">{error}</div>
          ) : null}

          {!payload && !busy && !error ? (
            <div className="route-merge-ai-preview">
              <div className="route-merge-ai-preview-head">
                <strong>原始 YAML 预览</strong>
                <span className="route-merge-ai-preview-hint">
                  这里只展示当前范围的原始 YAML；点击「开始分析」后会附带规则摘要发送给模型。
                </span>
              </div>
              <div className="route-merge-ai-preview-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onConfirmRun()}
                  disabled={!previewUserContent.trim()}
                >
                  开始分析
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void navigator.clipboard.writeText(previewUserContent)}
                  disabled={!previewUserContent.trim()}
                >
                  复制原始 YAML
                </button>
              </div>
              <div
                className="route-merge-ai-preview-editor"
                role="region"
                aria-label="原始 YAML 预览"
              >
                <div className="route-merge-ai-code-shell">
                  <div className="route-merge-ai-code-gutter" aria-hidden="true">
                    {previewLines.map((_, i) => (
                      <span key={`preview-${i}`}>
                        {String(i + 1).padStart(previewLineDigits, " ")}
                      </span>
                    ))}
                  </div>
                  <pre className="route-merge-ai-code-pre">{previewLines.join("\n") || " "}</pre>
                </div>
              </div>
            </div>
          ) : null}

          {payload ? (
            <div className="route-merge-ai route-merge-ai-in-modal">
              <div className="route-merge-ai-advice">
                <div className="route-merge-ai-summary-card">
                  <div>
                    <span className="route-merge-ai-kicker">优化结论</span>
                    <p className="route-merge-ai-summary">
                      {payload.summary || "已完成 VS/DR/Ingress 等价压缩分析。"}
                    </p>
                  </div>
                  {payload.compressionEstimate ? (
                    <span className="route-merge-ai-summary-pill">
                      {payload.compressionEstimate}
                    </span>
                  ) : null}
                </div>
                {payload.semanticEquivalence ? (
                  <div className="route-merge-ai-equivalence">
                    <strong>等价性判断</strong>
                    <span>{payload.semanticEquivalence}</span>
                  </div>
                ) : null}
                {optimizationPlan.length || changeSummary.length || validationChecklist.length ? (
                  <div className="route-merge-ai-review-grid">
                    {optimizationPlan.length ? (
                      <section className="route-merge-ai-review-block">
                        <strong>优化思路</strong>
                        <ol>
                          {optimizationPlan.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ol>
                      </section>
                    ) : null}
                    {changeSummary.length ? (
                      <section className="route-merge-ai-review-block">
                        <strong>实际变更</strong>
                        <ul>
                          {changeSummary.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {validationChecklist.length ? (
                      <section className="route-merge-ai-review-block">
                        <strong>复核清单</strong>
                        <ul>
                          {validationChecklist.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                ) : null}
                {payload.ingressDomainNotes.length ? (
                  <div className="route-merge-ai-block">
                    <strong>Ingress</strong>
                    <ul>
                      {payload.ingressDomainNotes.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {payload.virtualServiceDomainNotes.length ? (
                  <div className="route-merge-ai-block">
                    <strong>VirtualService</strong>
                    <ul>
                      {payload.virtualServiceDomainNotes.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {payload.destinationRuleDomainNotes.length ? (
                  <div className="route-merge-ai-block">
                    <strong>DestinationRule</strong>
                    <ul>
                      {payload.destinationRuleDomainNotes.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {payload.suggestions.length ? (
                  <div className="route-merge-ai-suggestion-panel">
                    <strong>优化建议</strong>
                    <ul className="route-merge-ai-suggestions">
                      {payload.suggestions.map((s, i) => (
                        <li key={`${s.title}-${i}`}>
                          <div className="route-merge-ai-suggestion-title">
                            <strong>{s.title}</strong>
                            {s.risk ? <span className="route-merge-risk">{s.risk}</span> : null}
                          </div>
                          <div>{s.detail}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div
                className="route-merge-ai-yaml-area"
                role="region"
                aria-label="原始与优化后的 YAML"
              >
                <div className="route-merge-ai-yaml-actions">
                  <strong className="route-merge-ai-yaml-title">YAML 输出</strong>
                  <span className="route-merge-ai-diff-stat">左 {sourceLineCount} 行</span>
                  <span className="route-merge-ai-diff-stat">右 {optimizedLineCount} 行</span>
                  <div className="route-merge-ai-yaml-tabs" role="tablist" aria-label="YAML 视图">
                    <button
                      type="button"
                      className={activeYamlTab === "yaml" ? "btn-secondary btn-pill-active" : "btn-secondary"}
                      onClick={() => setActiveYamlTab("yaml")}
                      role="tab"
                      aria-selected={activeYamlTab === "yaml"}
                    >
                      代码
                    </button>
                    <button
                      type="button"
                      className={activeYamlTab === "diff" ? "btn-secondary btn-pill-active" : "btn-secondary"}
                      onClick={() => setActiveYamlTab("diff")}
                      role="tab"
                      aria-selected={activeYamlTab === "diff"}
                      disabled={!hasOptimizedYaml}
                      title={!hasOptimizedYaml ? "需要 AI 返回 optimizedYaml 才能对比" : "Diff 对比"}
                    >
                      Diff
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => void navigator.clipboard.writeText(sourceYaml)}
                  >
                    复制原始 YAML
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => void navigator.clipboard.writeText(optimizedYaml)}
                    disabled={!hasOptimizedYaml}
                  >
                    复制优化后 YAML
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() =>
                      downloadText(
                        `route-merge-ai-${Date.now()}.yaml`,
                        optimizedYaml,
                        "text/yaml;charset=utf-8",
                      )
                    }
                    disabled={!hasOptimizedYaml}
                  >
                    下载优化后 YAML
                  </button>
                </div>

                {aiYamlCheck ? (
                  <div
                    className={
                      aiYamlCheck.ok ? "route-merge-validate ok" : "route-merge-validate bad"
                    }
                  >
                    本地校验：{aiYamlCheck.detail}
                  </div>
                ) : null}

                {!hasOptimizedYaml ? (
                  <div className="route-merge-ai-empty-yaml">
                    本次 AI 输出未包含完整 optimizedYaml。已保留原始
                    YAML（左侧）；请重试或调整模型配置后再次分析。
                  </div>
                ) : null}

                <div className="route-merge-ai-yaml-body" role="region" aria-label="YAML 详情">
                  {activeYamlTab === "yaml" ? (
                    <div
                      className="route-merge-ai-yaml-grid"
                      role="region"
                      aria-label="原始 YAML 与优化后 YAML"
                    >
                      <div className="route-merge-ai-yaml-pane">
                        <div className="route-merge-ai-yaml-head">
                          <span>原始 YAML</span>
                          <span>{sourceLineCount} 行</span>
                        </div>
                        <div className="route-merge-ai-code-shell">
                          <div className="route-merge-ai-code-gutter" aria-hidden="true">
                            {sourceLines.map((_, i) => (
                              <span key={`old-${i}`}>{String(i + 1).padStart(lineDigits, " ")}</span>
                            ))}
                          </div>
                          <pre className="route-merge-ai-code-pre">{sourceLines.join("\n") || " "}</pre>
                        </div>
                      </div>

                      <div className="route-merge-ai-yaml-pane">
                        <div className="route-merge-ai-yaml-head">
                          <span>优化后 YAML</span>
                          <span>{optimizedLineCount} 行</span>
                        </div>
                        <div className="route-merge-ai-code-shell">
                          <div className="route-merge-ai-code-gutter" aria-hidden="true">
                            {optimizedLines.map((_, i) => (
                              <span key={`new-${i}`}>{String(i + 1).padStart(lineDigits, " ")}</span>
                            ))}
                          </div>
                          <pre className="route-merge-ai-code-pre">{optimizedLines.join("\n") || " "}</pre>
                        </div>
                      </div>
                    </div>
                  ) : hasOptimizedYaml ? (
                    <div className="route-merge-ai-diff" role="region" aria-label="原始 YAML 与 AI 生成 YAML 差异对比">
                      <div className="route-merge-ai-diff-head route-merge-ai-diff-head--old">
                        <span>Diff（原始）</span>
                        <span>{sourceLineCount} 行</span>
                      </div>
                      <div className="route-merge-ai-diff-head route-merge-ai-diff-head--new">
                        <span>Diff（优化后）</span>
                        <span>{optimizedLineCount} 行</span>
                      </div>
                      {diffDisplay.rows.map((row, index) =>
                        row.kind === "skip" ? (
                          <div
                            className="route-merge-ai-diff-row route-merge-ai-diff-row--skip"
                            key={`skip-${row.oldLabel}-${row.newLabel}-${index}`}
                          >
                            <div className="route-merge-ai-diff-skip">
                              <span>{row.oldLabel ? `左 ${row.oldLabel}` : "中间内容"}</span>
                              <strong>已折叠 {row.count} 行未变化内容</strong>
                              <span>{row.newLabel ? `右 ${row.newLabel}` : ""}</span>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`route-merge-ai-diff-row route-merge-ai-diff-row--${row.kind}`}
                            key={`${row.kind}-${row.oldLineNo ?? "x"}-${row.newLineNo ?? "x"}-${index}`}
                          >
                            <div className="route-merge-ai-diff-cell route-merge-ai-diff-cell--old">
                              <span className="route-merge-ai-diff-line-no">{row.oldLineNo ?? ""}</span>
                              <code>{row.oldText || " "}</code>
                            </div>
                            <div className="route-merge-ai-diff-cell route-merge-ai-diff-cell--new">
                              <span className="route-merge-ai-diff-line-no">{row.newLineNo ?? ""}</span>
                              <code>{row.newText || " "}</code>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              {payload.disclaimer ? (
                <div className="route-merge-disclaimer">{payload.disclaimer}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
