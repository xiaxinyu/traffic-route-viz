import { useEffect, useMemo, useState } from "react";

import { buildFlowGraph } from "../../domain/buildGraph";
import { parseK8sYaml } from "../../domain/k8sParser";
import {
  ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN,
  clearLocalRouteMergeAiSystemPrompt,
  describeRouteMergeAiPromptSource,
  resolveRouteMergeAiSystemPrompt,
  writeLocalRouteMergeAiSystemPrompt,
} from "./routeMergeAiPrompt";
import type { RouteMergeAiPayload } from "./routeMergeTypes";

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

export type RouteMergeAiModalProps = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  payload: RouteMergeAiPayload | null;
  error: string | null;
  scopeLabel: string | null;
};

function promptSourceLabel(src: ReturnType<typeof describeRouteMergeAiPromptSource>): string {
  if (src === "local") return "本浏览器已保存的模版";
  if (src === "config") return "config.json 中的 systemPrompt";
  return "内置默认";
}

export function RouteMergeAiModal(props: RouteMergeAiModalProps) {
  const { open, onClose, busy, payload, error, scopeLabel } = props;
  const [promptDraft, setPromptDraft] = useState("");
  const [promptStamp, setPromptStamp] = useState(0);

  useEffect(() => {
    if (open) {
      setPromptDraft(resolveRouteMergeAiSystemPrompt());
    }
  }, [open, promptStamp]);

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

  const effectiveSource = useMemo(() => describeRouteMergeAiPromptSource(), [promptStamp]);

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

          {error ? <div className="route-merge-error route-merge-ai-modal-error">{error}</div> : null}

          {payload ? (
            <div className="route-merge-ai route-merge-ai-in-modal">
              {payload.summary ? <p className="route-merge-ai-summary">{payload.summary}</p> : null}
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
                <ul className="route-merge-ai-suggestions">
                  {payload.suggestions.map((s, i) => (
                    <li key={`${s.title}-${i}`}>
                      <strong>{s.title}</strong>{" "}
                      {s.risk ? <span className="route-merge-risk">({s.risk})</span> : null}
                      <div>{s.detail}</div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {payload.optimizedYaml.trim() ? (
                <>
                  <div className="route-merge-ai-yaml-actions">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => void navigator.clipboard.writeText(payload.optimizedYaml)}
                    >
                      复制 AI 优化 YAML
                    </button>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() =>
                        downloadText(
                          `route-merge-ai-${Date.now()}.yaml`,
                          payload.optimizedYaml,
                          "text/yaml;charset=utf-8",
                        )
                      }
                    >
                      下载
                    </button>
                  </div>
                  {aiYamlCheck ? (
                    <div className={aiYamlCheck.ok ? "route-merge-validate ok" : "route-merge-validate bad"}>
                      本地校验：{aiYamlCheck.detail}
                    </div>
                  ) : null}
                  <pre className="route-merge-ai-pre">{payload.optimizedYaml}</pre>
                </>
              ) : null}
              {payload.disclaimer ? (
                <div className="route-merge-disclaimer">{payload.disclaimer}</div>
              ) : null}
            </div>
          ) : null}

          <details className="route-merge-ai-template-details">
            <summary>系统提示模版（影响下一次请求）</summary>
            <p className="route-merge-ai-template-meta">
              当前生效来源：<strong>{promptSourceLabel(effectiveSource)}</strong>
              。优先级：此处保存到浏览器 &gt; <code className="route-merge-ai-code">config.json</code>{" "}
              <code className="route-merge-ai-code">routeMergeAi.systemPrompt</code> &gt; 内置。须让模型仍只输出与面板兼容的
              JSON，否则无法解析。
            </p>
            <textarea
              className="route-merge-ai-template-textarea"
              spellCheck={false}
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={12}
              aria-label="系统提示模版"
            />
            <div className="route-merge-ai-template-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  writeLocalRouteMergeAiSystemPrompt(promptDraft);
                  setPromptStamp((n) => n + 1);
                }}
              >
                保存到本浏览器
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  clearLocalRouteMergeAiSystemPrompt();
                  setPromptDraft(ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN);
                  setPromptStamp((n) => n + 1);
                }}
              >
                清除浏览器覆盖并填入内置
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
