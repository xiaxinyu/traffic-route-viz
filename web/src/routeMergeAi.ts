import type { RouteMergeAiPayload, RouteMergeAnalysis } from "./routeMergeTypes";
import type { RouteMergeAiResolved } from "./routeMergeAiConfig";
import type { IndexedRawDoc } from "./routeMergeRawDocs";

const SYSTEM_PROMPT = `你是 Kubernetes 与 Istio 流量治理专家。用户会提供 Ingress、VirtualService、DestinationRule 的 YAML 片段，以及本工具「规则引擎」已给出的合并分级（Safe/Review/Blocked）。

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

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n…(已截断，共 ${s.length} 字符)`;
}

function collectKindYaml(docs: IndexedRawDoc[], kind: string, budget: number): string {
  const parts: string[] = [];
  let used = 0;
  for (const d of docs) {
    if (d.kind !== kind) continue;
    const chunk = `# ${d.refKey}\n${d.yaml}`;
    if (used + chunk.length > budget) break;
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join("\n---\n");
}

export function buildRouteMergeAiUserContent(
  analysis: RouteMergeAnalysis,
  indexed: IndexedRawDoc[],
  mergedYamlSample: string,
  maxTotalChars = 120_000,
): string {
  const perKindBudget = Math.floor(maxTotalChars / 4);
  const ing = collectKindYaml(indexed, "Ingress", perKindBudget);
  const vs = collectKindYaml(indexed, "VirtualService", perKindBudget);
  const dr = collectKindYaml(indexed, "DestinationRule", perKindBudget);
  const rules = analysis.recommendations
    .map(
      (r) =>
        `- [${r.level}] ${r.kind} ${r.resourceRefs.join(", ")}: ${r.rationale} (Δ行≈${r.estimatedLineDelta})`,
    )
    .join("\n");

  const mergedClip = clip(mergedYamlSample, Math.floor(perKindBudget));

  return clip(
    `## 规则引擎摘要\n${rules}\n\n## v1 提示\n${analysis.v1RulesReminder}\n\n## Ingress YAML 片段\n${ing || "(无)"}\n\n## VirtualService YAML 片段\n${vs || "(无)"}\n\n## DestinationRule YAML 片段\n${dr || "(无)"}\n\n## 合并后的全量 YAML（截断样本）\n${mergedClip}`,
    maxTotalChars,
  );
}

function parseJsonPayload(raw: string): RouteMergeAiPayload {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("模型未返回可解析的 JSON");
  }
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  const suggestionsRaw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    ingressDomainNotes: Array.isArray(parsed.ingressDomainNotes)
      ? parsed.ingressDomainNotes.filter((x): x is string => typeof x === "string")
      : [],
    virtualServiceDomainNotes: Array.isArray(parsed.virtualServiceDomainNotes)
      ? parsed.virtualServiceDomainNotes.filter((x): x is string => typeof x === "string")
      : [],
    destinationRuleDomainNotes: Array.isArray(parsed.destinationRuleDomainNotes)
      ? parsed.destinationRuleDomainNotes.filter((x): x is string => typeof x === "string")
      : [],
    suggestions: suggestionsRaw.map((s) => {
      const o = s as Record<string, unknown>;
      return {
        title: typeof o.title === "string" ? o.title : "",
        detail: typeof o.detail === "string" ? o.detail : "",
        risk: typeof o.risk === "string" ? o.risk : undefined,
      };
    }),
    optimizedYaml: typeof parsed.optimizedYaml === "string" ? parsed.optimizedYaml : "",
    disclaimer: typeof parsed.disclaimer === "string" ? parsed.disclaimer : "",
  };
}

export async function callRouteMergeAi(
  cfg: RouteMergeAiResolved,
  userContent: string,
  signal?: AbortSignal,
): Promise<RouteMergeAiPayload> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) headers["api-key"] = cfg.apiKey;

  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_completion_tokens: 8192,
  };

  let res = await fetch(cfg.requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const t = await res.text();
    // Older deployments may reject max_completion_tokens
    if (res.status === 400 && String(t).includes("max_completion_tokens")) {
      delete body.max_completion_tokens;
      body.max_tokens = 4096;
      res = await fetch(cfg.requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    }
    if (!res.ok) {
      throw new Error(`Azure OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
    }
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("模型返回空内容");
  }
  return parseJsonPayload(content);
}
