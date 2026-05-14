/**
 * 从 `git config` 文本中解析 `[remote "origin"]` 下的 `url`（支持 `url =` / `url=`，含 tab）。
 * 若存在多个 origin 块，取首个出现的 `url`。
 */
export function parseOriginRemoteUrl(configText: string): string | null {
  const lines = configText.split(/\r?\n/);
  let inOrigin = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[remote\s+"origin"\s*\]$/i.test(line) || /^\[remote\s+'origin'\s*\]$/i.test(line)) {
      inOrigin = true;
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      inOrigin = false;
      continue;
    }
    if (!inOrigin) continue;
    const m = line.match(/^url\s*=\s*(.+)$/i);
    if (m?.[1]) {
      const v = m[1].trim().replace(/^["']|["']$/g, "");
      return v.length > 0 ? v : null;
    }
  }
  return null;
}
