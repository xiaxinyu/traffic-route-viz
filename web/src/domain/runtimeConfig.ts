export type RuntimeConfig = {
  auth?: {
    enabled?: boolean;
    username?: string;
    password?: string;
    /** Session TTL in hours */
    ttlHours?: number;
  };
  /**
   * 可选：路由合并「AI 助手」调用 Azure OpenAI（浏览器直连或 dev 代理）。
   * apiKey 出现在浏览器可见配置中，仅限可信内网；生产更推荐网关或 Vite 代理注入。
   */
  routeMergeAi?: {
    enabled?: boolean;
    /** 例如 `https://<resource>.cognitiveservices.azure.com/openai` */
    baseUrl?: string;
    deployment?: string;
    apiVersion?: string;
    apiKey?: string;
    /**
     * 可选：覆盖发给模型的 **system** 角色全文。须仍要求模型只输出可解析 JSON（与内置 schema 一致），
     * 否则前端无法展示结构化结果。优先级低于浏览器内「AI 弹窗」保存的模版。
     */
    systemPrompt?: string;
    /**
     * 开发模式：请求发往同源 `/trv-azure-openai`，由 Vite 代理转发并在服务端加 `api-key`
     *（见 web/.env 中 `AZURE_OPENAI_API_KEY`）。
     */
    useDevProxy?: boolean;
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
