import { getRuntimeConfig } from "../../domain/runtimeConfig";

/** 内置系统提示：须让模型输出可解析的 JSON（与 `parseJsonPayload` 一致）。 */
export const ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN = `你是 Kubernetes 与 Istio 流量治理专家。用户会提供 Ingress、VirtualService、DestinationRule 的 YAML 片段，以及本工具「规则引擎」已给出的合并分级（Safe/Review/Blocked）。

请按以下领域分别思考并输出 **严格 JSON**（不要 Markdown 围栏，不要前后说明文字）：
1) Ingress：入口合并、TLS/class、路径冲突、与 Service 的耦合。
2) VirtualService：hosts/gateways、http 匹配与路由顺序、subset 与权重。
3) DestinationRule：与 VS 中 destination.subset 的一致性、熔断/负载策略对路由的影响。

JSON schema（字段必须齐全，数组可为空，optimizedYaml 必须为非空字符串）：
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
- optimizedYaml 必须是“采纳建议后的完整新 YAML/code”，不是 diff、patch、片段、伪代码或 Markdown；需要包含本次分析范围内最终应保留的完整 YAML document（包括未改动但仍属于最终结果的文档），用 --- 分隔，不要用省略号。
- optimizedYaml 仅包含 networking.k8s.io Ingress、Istio VirtualService/DestinationRule 等用户已提供的种类；不要编造不存在的资源名。
- 若输入中提供了「当前完整 YAML」，必须输出完整 optimizedYaml：有明确改动则输出改进后的完整 YAML；若没有明确改动，也必须输出与输入等价的完整 YAML（可做格式化/排序等不改变语义的整理）。
- 若只收到截断样本或输入过大，为了满足“必须输出完整 YAML”，请输出你能保证语义等价的最安全结果：优先原样输出「当前完整 YAML」（或你收到的完整部分），并在 disclaimer/suggestions 中明确标注“由于输入不完整/过大，本次 optimizedYaml 可能未包含全部资源或未做改动，需要人工复核”。不要返回空字符串。
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
