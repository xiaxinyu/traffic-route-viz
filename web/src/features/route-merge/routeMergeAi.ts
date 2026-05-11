import type { RouteMergeAiPayload, RouteMergeAnalysis } from "./routeMergeTypes";
import type { RouteMergeAiResolved } from "./routeMergeAiConfig";
import type { IndexedRawDoc } from "./routeMergeRawDocs";
import { ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN } from "./routeMergeAiPrompt";

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

export type BuildRouteMergeAiUserContentOptions = {
  maxTotalChars?: number;
  /** Prepended so the model scopes answers (e.g. single imported file vs merged corpus). */
  scopeHeading?: string;
};

export function buildRouteMergeAiUserContent(
  analysis: RouteMergeAnalysis,
  indexed: IndexedRawDoc[],
  mergedYamlSample: string,
  options?: BuildRouteMergeAiUserContentOptions,
): string {
  const maxTotalChars = options?.maxTotalChars ?? 120_000;
  const scopeHeading = options?.scopeHeading?.trim();
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

  const core = clip(
    `## 规则引擎摘要\n${rules}\n\n## v1 提示\n${analysis.v1RulesReminder}\n\n## Ingress YAML 片段\n${ing || "(无)"}\n\n## VirtualService YAML 片段\n${vs || "(无)"}\n\n## DestinationRule YAML 片段\n${dr || "(无)"}\n\n## 合并后的全量 YAML（截断样本）\n${mergedClip}`,
    maxTotalChars,
  );
  if (!scopeHeading) return core;
  return clip(`## 分析范围\n${scopeHeading}\n\n${core}`, maxTotalChars);
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

export type CallRouteMergeAiOptions = {
  /** 覆盖默认 system 提示；须仍约束模型输出与 `parseJsonPayload` 兼容的 JSON。 */
  systemPrompt?: string;
};

export async function callRouteMergeAi(
  cfg: RouteMergeAiResolved,
  userContent: string,
  signal?: AbortSignal,
  opts?: CallRouteMergeAiOptions,
): Promise<RouteMergeAiPayload> {
  const system =
    typeof opts?.systemPrompt === "string" && opts.systemPrompt.trim().length > 0
      ? opts.systemPrompt
      : ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) headers["api-key"] = cfg.apiKey;

  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: system },
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
