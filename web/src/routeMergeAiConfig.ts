import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export type RouteMergeAiResolved = {
  enabled: boolean;
  deployment: string;
  apiVersion: string;
  /** Request URL for chat/completions (incl. query api-version). */
  requestUrl: string;
  apiKey: string | undefined;
};

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * Build Azure OpenAI–style chat completions URL.
 * `baseUrl` is typically `https://<resource>.cognitiveservices.azure.com/openai`.
 */
export function buildAzureOpenAiChatCompletionsUrl(
  baseUrl: string,
  deployment: string,
  apiVersion: string,
): string {
  const base = trimSlash(baseUrl);
  const q = new URLSearchParams({ "api-version": apiVersion });
  return `${base}/deployments/${encodeURIComponent(deployment)}/chat/completions?${q.toString()}`;
}

function coalesceRouteMergeAi(
  rc: RuntimeConfig["routeMergeAi"],
): {
  enabled: boolean;
  baseUrl: string;
  deployment: string;
  apiVersion: string;
  apiKey?: string;
  useDevProxy: boolean;
} {
  const enabled =
    rc?.enabled === true ||
    (import.meta.env.VITE_ROUTE_MERGE_AI_ENABLED as string | undefined) === "true";
  const baseUrl =
    rc?.baseUrl ??
    (import.meta.env.VITE_AZURE_OPENAI_BASE_URL as string | undefined) ??
    "";
  const deployment =
    rc?.deployment ??
    (import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT as string | undefined) ??
    "gpt-4o";
  const apiVersion =
    rc?.apiVersion ??
    (import.meta.env.VITE_AZURE_OPENAI_API_VERSION as string | undefined) ??
    "2025-04-01-preview";
  const apiKey =
    rc?.apiKey ?? (import.meta.env.VITE_AZURE_OPENAI_API_KEY as string | undefined);
  const useDevProxy =
    rc?.useDevProxy === true ||
    (import.meta.env.VITE_AZURE_OPENAI_USE_DEV_PROXY as string | undefined) === "true";
  return { enabled, baseUrl, deployment, apiVersion, apiKey, useDevProxy };
}

/**
 * Resolve LLM config for route-merge assistant. Returns null if disabled or misconfigured.
 */
export function resolveRouteMergeAiConfig(): RouteMergeAiResolved | null {
  const rc = getRuntimeConfig();
  const m = coalesceRouteMergeAi(rc.routeMergeAi);
  if (!m.enabled) return null;

  const useProxy = import.meta.env.DEV && m.useDevProxy;
  const baseForUrl = useProxy
    ? `${trimSlash(window.location.origin)}/trv-azure-openai`
    : trimSlash(m.baseUrl);

  if (!useProxy && !m.baseUrl) return null;

  const requestUrl = buildAzureOpenAiChatCompletionsUrl(baseForUrl, m.deployment, m.apiVersion);

  if (!useProxy && !m.apiKey) {
    return null;
  }

  return {
    enabled: true,
    deployment: m.deployment,
    apiVersion: m.apiVersion,
    requestUrl,
    apiKey: useProxy ? undefined : m.apiKey,
  };
}

/** Human-readable hint when AI button is disabled. */
export function routeMergeAiDisabledReason(): string {
  const rc = getRuntimeConfig();
  const m = coalesceRouteMergeAi(rc.routeMergeAi);
  if (!m.enabled) return "未启用：在 config.json 设置 routeMergeAi.enabled=true 或 VITE_ROUTE_MERGE_AI_ENABLED=true。";
  const useProxy = import.meta.env.DEV && m.useDevProxy;
  if (!useProxy && !m.baseUrl)
    return "缺少 baseUrl：config.json.routeMergeAi.baseUrl 或 VITE_AZURE_OPENAI_BASE_URL。";
  if (!useProxy && !m.apiKey)
    return "缺少 API Key：config.routeMergeAi.apiKey 或 VITE_AZURE_OPENAI_API_KEY（仅可信环境）。";
  if (m.useDevProxy && !import.meta.env.DEV)
    return "已配置 useDevProxy，但当前非开发模式；生产环境请在网关侧代理 OpenAI 并放开 CORS，或改用内网直连 baseUrl + apiKey。";
  return "配置不完整。";
}
