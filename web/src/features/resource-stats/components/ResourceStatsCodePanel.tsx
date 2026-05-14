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

  const statsLine = useMemo(() => {
    if (!selectedPath) return "未选择文件";
    if (preview.status === "idle") return selectedPath;
    if (preview.status === "loading") return `${selectedPath} · 读取中…`;
    if (preview.status === "error") return `${selectedPath} · 读取失败`;
    const lines = editorValue.split("\n").length;
    const chars = editorValue.length;
    return `${selectedPath} · ${lines} 行 · ${chars} 字符`;
  }, [selectedPath, preview, editorValue]);

  const placeholder = useMemo(() => {
    if (selectedPath && preview.status === "loading") return "读取中…";
    return "在左侧目录树中点击一个文件，在此只读预览文本内容。";
  }, [selectedPath, preview.status]);

  return (
    <div className="rs-code-panel">
      <div className="yaml-editor-actions rs-code-actions">
        <div className="yaml-editor-stats" data-testid="resource-stats-code-stats">
          {statsLine}
        </div>
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
