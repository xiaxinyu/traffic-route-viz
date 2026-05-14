import { useMemo, useRef, useEffect } from "react";

import { formatByteSize } from "../../../domain/formatByteSize";
import type { CodePreviewState } from "../hooks/useLocalFolderScan";

type Props = {
  selectedPath: string | null;
  selectedFile: File | null;
  preview: CodePreviewState;
};

export function ResourceStatsCodePanel({ selectedPath, selectedFile, preview }: Props) {
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

  const footerLine = useMemo(() => {
    if (!selectedPath) return "未选择文件";
    const parts: string[] = [selectedPath];
    if (selectedFile) {
      parts.push(formatByteSize(selectedFile.size));
      const mime = selectedFile.type?.trim();
      if (mime) parts.push(mime);
    }
    if (preview.status === "loading") {
      parts.push("读取中…");
      return parts.join(" · ");
    }
    if (preview.status === "error") {
      parts.push("读取失败");
      return parts.join(" · ");
    }
    if (preview.status === "ready" && editorValue) {
      const lines = editorValue.split("\n").length;
      parts.push(`${lines} 行`, `${editorValue.length} 字符`);
    }
    return parts.join(" · ");
  }, [selectedPath, selectedFile, preview.status, editorValue]);

  const placeholder = useMemo(() => {
    if (selectedPath && preview.status === "loading") return "读取中…";
    if (!selectedPath) return "在左侧选择文件以预览";
    return "";
  }, [selectedPath, preview.status]);

  return (
    <div className="rs-code-panel">
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
      <div className="rs-code-footer" data-testid="resource-stats-code-stats">
        {footerLine}
      </div>
    </div>
  );
}
