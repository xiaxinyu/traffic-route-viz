import { getRuntimeConfig, type RuntimeConfig } from "../../domain/runtimeConfig";

export type RouteMergeAiResolved = {
  enabled: boolean;
  /** Which wire protocol we are calling. */
  apiStyle: "azure-deployments" | "openai-v1" | "azure-responses";
  /**
   * For azure-deployments style: deployment name.
   * For openai-v1 / azure-responses style: model name.
   */
  modelId: string;
  /** api-version for azure-deployments style only. */
  apiVersion: string | null;
  /** Request URL for chat/completions. */
  requestUrl: string;
  /** Header strategy for authentication. */
  authHeader: { name: "api-key"; value: string } | { name: "Authorization"; value: string } | null;
};

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function stripQueryAndHash(s: string): string {
  const query = s.indexOf("?");
  const hash = s.indexOf("#");
  const cut = [query, hash].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  return cut === undefined ? s : s.slice(0, cut);
}

function normalizeApiStyle(value: unknown): RouteMergeAiResolved["apiStyle"] | undefined {
  return value === "azure-deployments" || value === "openai-v1" || value === "azure-responses"
    ? value
    : undefined;
}

function configuredBasePath(
  configuredBaseUrl: string,
  apiStyle: RouteMergeAiResolved["apiStyle"],
): string {
  const fallbackPath = apiStyle === "openai-v1" ? "" : "/openai";
  try {
    const u = new URL(configuredBaseUrl);
    const path = trimSlash(u.pathname);
    return path || fallbackPath;
  } catch {
    const path = trimSlash(stripQueryAndHash(configuredBaseUrl));
    return path.startsWith("/") ? path : fallbackPath;
  }
}

export function buildDevProxyBaseUrl(
  browserOrigin: string,
  configuredBaseUrl: string,
  apiStyle: RouteMergeAiResolved["apiStyle"],
): string {
  const basePath = configuredBasePath(configuredBaseUrl, apiStyle);
  return `${trimSlash(browserOrigin)}/trv-azure-openai${basePath}`;
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
  const base = trimSlash(stripQueryAndHash(baseUrl));
  const q = new URLSearchParams({ "api-version": apiVersion });
  return `${base}/deployments/${encodeURIComponent(deployment)}/chat/completions?${q.toString()}`;
}

/**
 * Build OpenAI v1-style chat completions URL.
 * `baseUrl` is typically `https://<host>/openai/v1`.
 */
export function buildOpenAiV1ChatCompletionsUrl(baseUrl: string): string {
  return `${trimSlash(stripQueryAndHash(baseUrl))}/chat/completions`;
}

/**
 * Build Azure OpenAI Responses API URL.
 * `baseUrl` is typically `https://<resource>.cognitiveservices.azure.com/openai`.
 */
export function buildAzureOpenAiResponsesUrl(baseUrl: string, apiVersion: string): string {
  const base = trimSlash(stripQueryAndHash(baseUrl));
  const root = base.endsWith("/responses") ? base.slice(0, -"/responses".length) : base;
  const q = new URLSearchParams({ "api-version": apiVersion });
  return `${root}/responses?${q.toString()}`;
}

function coalesceRouteMergeAi(rc: RuntimeConfig["routeMergeAi"]): {
  enabled: boolean;
  baseUrl: string;
  deployment: string;
  model: string;
  apiVersion: string;
  apiKey?: string;
  bearerToken?: string;
  apiStyle?: "azure-deployments" | "openai-v1" | "azure-responses";
  useDevProxy: boolean;
} {
  const enabled =
    rc?.enabled === true ||
    (import.meta.env.VITE_ROUTE_MERGE_AI_ENABLED as string | undefined) === "true";
  const baseUrl =
    rc?.baseUrl ?? (import.meta.env.VITE_AZURE_OPENAI_BASE_URL as string | undefined) ?? "";
  const deployment =
    rc?.deployment ??
    (import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT as string | undefined) ??
    "gpt-4o";
  const model =
    (typeof rc?.model === "string" ? rc.model : undefined) ??
    (import.meta.env.VITE_AZURE_OPENAI_MODEL as string | undefined) ??
    deployment;
  const apiVersion =
    rc?.apiVersion ??
    (import.meta.env.VITE_AZURE_OPENAI_API_VERSION as string | undefined) ??
    "2025-04-01-preview";
  const apiKey = rc?.apiKey ?? (import.meta.env.VITE_AZURE_OPENAI_API_KEY as string | undefined);
  const bearerToken =
    (typeof rc?.bearerToken === "string" ? rc.bearerToken : undefined) ??
    (import.meta.env.VITE_AZURE_API_KEY as string | undefined);
  const apiStyle =
    normalizeApiStyle(rc?.apiStyle) ??
    normalizeApiStyle(import.meta.env.VITE_AZURE_OPENAI_API_STYLE);
  const useDevProxy =
    rc?.useDevProxy === true ||
    (import.meta.env.VITE_AZURE_OPENAI_USE_DEV_PROXY as string | undefined) === "true";
  return {
    enabled,
    baseUrl,
    deployment,
    model,
    apiVersion,
    apiKey,
    bearerToken,
    apiStyle,
    useDevProxy,
  };
}

function inferApiStyle(
  baseUrl: string,
  explicit?: RouteMergeAiResolved["apiStyle"],
): RouteMergeAiResolved["apiStyle"] {
  if (explicit) return explicit;
  const b = trimSlash(baseUrl);
  // The user's official curl uses `/openai/v1/chat/completions`
  if (b.includes("/openai/v1")) return "openai-v1";
  // Azure Responses API: `/openai/responses?api-version=...`
  if (b.includes("/responses")) return "azure-responses";
  return "azure-deployments";
}

/**
 * Resolve LLM config for route-merge assistant. Returns null if disabled or misconfigured.
 */
export function resolveRouteMergeAiConfig(): RouteMergeAiResolved | null {
  const rc = getRuntimeConfig();
  const m = coalesceRouteMergeAi(rc.routeMergeAi);
  if (!m.enabled) return null;

  const useProxy = import.meta.env.DEV && m.useDevProxy;
  if (!m.baseUrl) return null;

  const apiStyle = inferApiStyle(m.baseUrl, m.apiStyle);
  const baseForUrl = useProxy
    ? buildDevProxyBaseUrl(window.location.origin, m.baseUrl, apiStyle)
    : trimSlash(m.baseUrl);
  const requestUrl = (() => {
    if (apiStyle === "openai-v1") return buildOpenAiV1ChatCompletionsUrl(baseForUrl);
    if (apiStyle === "azure-responses")
      return buildAzureOpenAiResponsesUrl(baseForUrl, m.apiVersion);
    return buildAzureOpenAiChatCompletionsUrl(baseForUrl, m.deployment, m.apiVersion);
  })();

  const authHeader: RouteMergeAiResolved["authHeader"] = useProxy
    ? null
    : apiStyle === "openai-v1" || apiStyle === "azure-responses"
      ? m.bearerToken
        ? { name: "Authorization", value: `Bearer ${m.bearerToken}` }
        : m.apiKey
          ? { name: "api-key", value: m.apiKey }
          : null
      : m.apiKey
        ? { name: "api-key", value: m.apiKey }
        : null;
  if (!useProxy && !authHeader) return null;

  return {
    enabled: true,
    apiStyle,
    modelId: apiStyle === "azure-deployments" ? m.deployment : m.model,
    apiVersion: apiStyle === "openai-v1" ? null : m.apiVersion,
    requestUrl,
    authHeader,
  };
}

/** Human-readable hint when AI button is disabled. */
export function routeMergeAiDisabledReason(): string {
  const rc = getRuntimeConfig();
  const m = coalesceRouteMergeAi(rc.routeMergeAi);
  if (!m.enabled)
    return "未启用：在 config.json 设置 routeMergeAi.enabled=true 或 VITE_ROUTE_MERGE_AI_ENABLED=true。";
  const useProxy = import.meta.env.DEV && m.useDevProxy;
  if (!m.baseUrl)
    return "缺少 baseUrl：config.json.routeMergeAi.baseUrl 或 VITE_AZURE_OPENAI_BASE_URL。";
  const apiStyle = inferApiStyle(m.baseUrl, m.apiStyle);
  if (
    !useProxy &&
    (apiStyle === "openai-v1" || apiStyle === "azure-responses") &&
    !m.bearerToken &&
    !m.apiKey
  )
    return "缺少 Bearer Token 或 API Key：config.routeMergeAi.bearerToken / apiKey 或 VITE_AZURE_API_KEY / VITE_AZURE_OPENAI_API_KEY（仅可信环境）。";
  if (!useProxy && apiStyle === "azure-deployments" && !m.apiKey)
    return "缺少 API Key：config.routeMergeAi.apiKey 或 VITE_AZURE_OPENAI_API_KEY（仅可信环境）。";
  if (m.useDevProxy && !import.meta.env.DEV)
    return "已配置 useDevProxy，但当前非开发模式；生产环境请在网关侧代理 OpenAI 并放开 CORS，或改用内网直连 baseUrl + apiKey。";
  return "配置不完整。";
}
