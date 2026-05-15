import { useMemo, useRef, useEffect } from "react";

import type { CodePreviewState } from "../hooks/useLocalFolderScan";

type Props = {
  selectedPath: string | null;
  preview: CodePreviewState;
};

export function ResourceStatsCodePanel({ selectedPath, preview }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const editorValue = useMemo(() => {
    if (preview.status === "ready") return preview.text;
    if (preview.status === "error") return preview.message;
    return "";
  }, [preview]);

  const lineCount = useMemo(() => {
    if (!editorValue) return 1;
    return Math.min(Math.max(editorValue.split("\n").length, 1), 9999);
  }, [editorValue]);
  const charCount = editorValue.length;

  useEffect(() => {
    const ta = taRef.current;
    const g = gutterRef.current;
    if (!ta || !g) return;
    g.scrollTop = ta.scrollTop;
  }, [editorValue]);

  const placeholder = useMemo(() => {
    if (selectedPath && preview.status === "loading") return "Loading…";
    if (!selectedPath) return "Select a file on the left to preview";
    return "";
  }, [selectedPath, preview.status]);

  const statusLabel = useMemo(() => {
    if (!selectedPath) return "Idle";
    if (preview.status === "loading") return "Loading";
    if (preview.status === "error") return "Error";
    if (preview.status === "ready") return "Ready";
    return "Idle";
  }, [selectedPath, preview.status]);

  return (
    <div className="rs-code-panel">
      <div className="rs-code-panel-head" aria-label="Preview file">
        <div className="rs-code-panel-head__main">
          <div className="rs-code-panel-head__path" title={selectedPath ?? "No file selected"}>
            {selectedPath ?? "No file selected"}
          </div>
          <div className="rs-code-panel-head__meta">
            {lineCount} lines · {charCount} chars
          </div>
        </div>
        <span
          className={`rs-code-panel-head__status rs-code-panel-head__status--${preview.status === "error" ? "err" : preview.status === "ready" ? "ok" : preview.status === "loading" ? "loading" : "idle"}`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="yaml-editor-shell rs-code-editor-shell">
        <div
          className="yaml-gutter"
          aria-hidden="true"
          ref={gutterRef}
          onScroll={() => {
            const ta = taRef.current;
            const g = gutterRef.current;
            if (ta && g) ta.scrollTop = g.scrollTop;
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i + 1}>{i + 1}</span>
          ))}
        </div>
        <textarea
          ref={taRef}
          className="yaml-editor"
          readOnly
          spellCheck={false}
          wrap="off"
          data-testid="resource-stats-code-textarea"
          value={editorValue}
          placeholder={placeholder}
          onScroll={() => {
            const ta = taRef.current;
            const g = gutterRef.current;
            if (ta && g) g.scrollTop = ta.scrollTop;
          }}
        />
      </div>
    </div>
  );
}
