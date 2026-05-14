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

  useEffect(() => {
    const ta = taRef.current;
    const g = gutterRef.current;
    if (!ta || !g) return;
    g.scrollTop = ta.scrollTop;
  }, [editorValue]);

  const placeholder = useMemo(() => {
    if (selectedPath && preview.status === "loading") return "读取中…";
    if (!selectedPath) return "在左侧选择文件以预览";
    return "";
  }, [selectedPath, preview.status]);

  const statusLabel = useMemo(() => {
    if (!selectedPath) return "待选择";
    if (preview.status === "loading") return "读取中";
    if (preview.status === "error") return "读取失败";
    if (preview.status === "ready") return "已就绪";
    return "待选择";
  }, [selectedPath, preview.status]);

  return (
    <div className="rs-code-panel">
      <div className="rs-code-panel-head" aria-label="当前预览文件">
        <div className="rs-code-panel-head__path" title={selectedPath ?? "未选择文件"}>
          {selectedPath ?? "未选择文件"}
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
