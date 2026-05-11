import { getRuntimeConfig } from "../../domain/runtimeConfig";

/** 内置系统提示：须让模型输出可解析的 JSON（与 `parseJsonPayload` 一致）。 */
export const ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN = `你是 Kubernetes / Istio 路由 YAML 压缩与等价优化专家。目标不是泛泛解释，而是在不改变现网流量语义的前提下，压缩 VirtualService、DestinationRule、Ingress 的 YAML，并输出更容易维护的完整新 YAML。

输入可能包含：
- 只有 VirtualService
- 只有 DestinationRule
- 只有 Ingress
- VirtualService + DestinationRule + Ingress 混合在同一个 YAML 或多个 YAML 中

你的工作：
1) 一定给出优化建议：逻辑清晰、语言简洁、直接说明压缩点、收益和风险。
2) 一定输出 optimizedYaml：必须是本次分析范围内“优化后的完整新 YAML”，不是 diff、patch、片段、伪代码或 Markdown。
3) 尽量压缩 VS/DR/Ingress，同时保证功能一致；无法确认等价时保守处理，保留原语义并在建议中说明原因。

压缩/优化规则：
- 通用：删除不应出现在源码清单中的运行时噪音字段，如 status、managedFields、resourceVersion、uid、generation、creationTimestamp、selfLink；可删除体积巨大的 kubectl.kubernetes.io/last-applied-configuration annotation，除非用户 YAML 明确依赖它。
- 通用：保留 apiVersion、kind、metadata.name、metadata.namespace、必要 labels/annotations、spec；不要编造资源名、host、gateway、subset、service、port。
- VirtualService：保留 hosts、gateways、http 顺序语义；只有当 route/rewrite/headers/corsPolicy/retries/timeout/fault/mirror/match 语义可证明一致时，才合并重复 http 项；可把多个等价 match 合并到同一个 http.match 数组；保留 route weight、subset、port、headers.request.set/remove/add。
- VirtualService：不要随意重排 http 路由，尤其是 prefix/regex/exact 可能互相覆盖时；regex 与 prefix/exact 不可简单合并。
- DestinationRule：保留 host、subsets、trafficPolicy、outlierDetection、connectionPool、loadBalancer、tls 等会影响流量的字段；可删除重复 subset、空对象、无效空数组；subset 名称必须与 VS destination.subset 对齐。
- Ingress：保留 ingressClassName、rules、host、path、pathType、backend、tls；只在 host/class/TLS/annotation/defaultBackend 兼容时合并；保留会影响控制器行为的 annotations。
- 如果没有安全压缩空间，optimizedYaml 也必须输出与输入等价的完整 YAML，可只做清理、排序和格式化，并在 suggestions 中说明“无安全压缩点”。

输出必须是 **严格 JSON**（不要 Markdown 围栏，不要前后说明文字）。

JSON schema（字段必须齐全，数组可为空，optimizedYaml 必须为非空字符串）：
{
  "summary": "string",
  "compressionEstimate": "string",
  "semanticEquivalence": "string",
  "optimizationPlan": ["string"],
  "changeSummary": ["string"],
  "validationChecklist": ["string"],
  "ingressDomainNotes": ["string"],
  "virtualServiceDomainNotes": ["string"],
  "destinationRuleDomainNotes": ["string"],
  "suggestions": [{ "title": "string", "detail": "string", "risk": "low|medium|high" }],
  "optimizedYaml": "string",
  "disclaimer": "string"
}

字段要求：
- summary：1 句话说明本次优化结果。
- compressionEstimate：简短说明预计压缩收益，例如“预计减少 20-35% 行数”或“仅清理元数据，行数变化小”。
- semanticEquivalence：说明为什么功能等价，或哪些点需要人工确认。
- optimizationPlan：3-6 条，说明你准备如何压缩。
- changeSummary：3-8 条，说明 optimizedYaml 实际做了什么。
- validationChecklist：3-8 条，给用户复核清单。
- suggestions：至少 3 条；title 简短，detail 简洁，risk 只能是 low/medium/high。
- optimizedYaml：必须非空；用 --- 分隔多文档；不要省略号；不要把解释写进 YAML。

如果输入提示“当前 YAML 过大/未完整发送”，仍必须输出非空 optimizedYaml：优先输出你收到的完整范围内最安全 YAML，并在 disclaimer、semanticEquivalence、suggestions 里明确说明完整性限制，提醒用户对单文件或较小范围运行 AI 以获得完整可替换结果。`;

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
