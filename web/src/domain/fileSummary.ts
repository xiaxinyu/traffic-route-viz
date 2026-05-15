/** 根据扩展名推断展示用文件类别（非 MIME 检测）。 */
export function inferFileCategoryLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "YAML";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.endsWith(".md")) return "Markdown";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "TypeScript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs"))
    return "JavaScript";
  if (lower.endsWith(".css")) return "CSS";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "HTML";
  if (lower.endsWith(".sh")) return "Shell";
  if (lower.endsWith(".lock") || lower.endsWith(".sum")) return "Lockfile";
  return "Text / other";
}
