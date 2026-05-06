export type RuntimeConfig = {
  auth?: {
    enabled?: boolean;
    username?: string;
    password?: string;
    /** Session TTL in hours */
    ttlHours?: number;
  };
};

declare global {
  interface Window {
    __TRV_CONFIG__?: RuntimeConfig;
  }
}

function envBool(v: unknown): boolean | undefined {
  if (typeof v !== "string") return undefined;
  if (v.toLowerCase() === "true") return true;
  if (v.toLowerCase() === "false") return false;
  return undefined;
}

export function getRuntimeConfig(): RuntimeConfig {
  return (
    window.__TRV_CONFIG__ ?? {
      auth: {
        // Default to requiring login unless explicitly disabled.
        enabled: envBool(import.meta.env.VITE_AUTH_ENABLED) ?? true,
        username: (import.meta.env.VITE_AUTH_USER as string | undefined) ?? undefined,
        password: (import.meta.env.VITE_AUTH_PASS as string | undefined) ?? undefined,
        ttlHours: Number(import.meta.env.VITE_AUTH_TTL_HOURS ?? 8) || 8,
      },
    }
  );
}

/** Load `/config.json` if present; safe to ignore missing file. */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) return getRuntimeConfig();
    const json = (await res.json()) as RuntimeConfig;
    window.__TRV_CONFIG__ = json;
  } catch {
    // ignore
  }
  return getRuntimeConfig();
}

