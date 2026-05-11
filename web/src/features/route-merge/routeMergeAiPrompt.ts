import { getRuntimeConfig } from "../../domain/runtimeConfig";

/** 内置系统提示：须让模型输出可解析的 JSON（与 `parseJsonPayload` 一致）。 */
export const ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN = `你是 Kubernetes 与 Istio 流量治理专家。用户会提供 Ingress、VirtualService、DestinationRule 的 YAML 片段，以及本工具「规则引擎」已给出的合并分级（Safe/Review/Blocked）。

请按以下领域分别思考并输出 **严格 JSON**（不要 Markdown 围栏，不要前后说明文字）：
1) Ingress：入口合并、TLS/class、路径冲突、与 Service 的耦合。
2) VirtualService：hosts/gateways、http 匹配与路由顺序、subset 与权重。
3) DestinationRule：与 VS 中 destination.subset 的一致性、熔断/负载策略对路由的影响。

JSON schema（字段必须齐全，数组可为空，optimizedYaml 可为空字符串）：
{
  "summary": "string",
  "ingressDomainNotes": ["string"],
  "virtualServiceDomainNotes": ["string"],
  "destinationRuleDomainNotes": ["string"],
  "suggestions": [{ "title": "string", "detail": "string", "risk": "low|medium|high" }],
  "optimizedYaml": "string",
  "disclaimer": "string"
}

要求：
- optimizedYaml 必须是有效多文档 YAML（用 --- 分隔）或空字符串；仅包含 networking.k8s.io Ingress、Istio VirtualService/DestinationRule 等用户已提供的种类；不要编造不存在的资源名。
- 若无法保证与现网语义等价，将 optimizedYaml 置为空，并在 suggestions 中说明人工步骤。
- 不要输出 JSON 以外的字符。`;

const LOCAL_STORAGE_KEY = "trv.routeMergeAi.systemPrompt";

export function readLocalRouteMergeAiSystemPrompt(): string | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw === null) return null;
    return raw;
  } catch {
    return null;
  }
}

/** 非空字符串表示用户在本浏览器覆盖了系统提示。 */
export function writeLocalRouteMergeAiSystemPrompt(text: string): void {
  try {
    const t = text.trim();
    if (!t) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, text);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function clearLocalRouteMergeAiSystemPrompt(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type RouteMergeAiPromptSource = "local" | "config" | "builtin";

export function describeRouteMergeAiPromptSource(): RouteMergeAiPromptSource {
  const local = readLocalRouteMergeAiSystemPrompt();
  if (local !== null && local.trim().length > 0) return "local";
  const cfg = getRuntimeConfig().routeMergeAi?.systemPrompt;
  if (typeof cfg === "string" && cfg.trim().length > 0) return "config";
  return "builtin";
}

/**
 * 解析顺序：本浏览器 localStorage → config.json `routeMergeAi.systemPrompt` → 内置。
 * 修改后下一次请求即生效。
 */
export function resolveRouteMergeAiSystemPrompt(): string {
  const local = readLocalRouteMergeAiSystemPrompt();
  if (local !== null && local.trim().length > 0) return local;
  const cfg = getRuntimeConfig().routeMergeAi?.systemPrompt;
  if (typeof cfg === "string" && cfg.trim().length > 0) return cfg;
  return ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN;
}
