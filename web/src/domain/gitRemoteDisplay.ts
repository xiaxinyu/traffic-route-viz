/**
 * 将常见 Git remote `url` 拆成可读字段（用于资源统计侧栏展示，非严格 URL 规范校验）。
 */
export type GitRemoteDisplayParts = {
  raw: string;
  host: string | null;
  path: string | null;
  /** 仅 http(s) 时可用于浏览器打开 */
  browserHref: string | null;
};

function stripDotGit(s: string): string {
  return s.replace(/\.git$/i, "").replace(/\/$/, "");
}

export function parseGitRemoteForDisplay(raw: string): GitRemoteDisplayParts {
  const t = raw.trim();
  if (!t) return { raw: t, host: null, path: null, browserHref: null };

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const pathPart = stripDotGit(u.pathname.replace(/^\//, ""));
      return { raw: t, host: u.hostname || null, path: pathPart || null, browserHref: t };
    } catch {
      return { raw: t, host: null, path: null, browserHref: null };
    }
  }

  if (/^ssh:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const pathPart = stripDotGit(u.pathname.replace(/^\//, ""));
      return { raw: t, host: u.hostname || null, path: pathPart || null, browserHref: null };
    } catch {
      return { raw: t, host: null, path: null, browserHref: null };
    }
  }

  const scp = /^([^@]+)@([^:]+):(.+)$/.exec(t);
  if (scp) {
    const host = scp[2] ?? null;
    const pathPart = stripDotGit(scp[3] ?? "");
    return { raw: t, host, path: pathPart || null, browserHref: null };
  }

  return { raw: t, host: null, path: null, browserHref: null };
}
