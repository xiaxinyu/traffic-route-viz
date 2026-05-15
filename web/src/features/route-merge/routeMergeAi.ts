import type { RouteMergeAiPayload, RouteMergeAnalysis } from "./routeMergeTypes";
import type { RouteMergeAiResolved } from "./routeMergeAiConfig";
import type { IndexedRawDoc } from "./routeMergeRawDocs";
import { ROUTE_MERGE_AI_SYSTEM_PROMPT_BUILTIN } from "./routeMergeAiPrompt";

function devLog(label: string, data: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  try {
    // eslint-disable-next-line no-console
    console.info(`[routeMergeAi] ${label}`, data);
  } catch {
    // ignore
  }
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n…(truncated, ${s.length} chars total)`;
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
  const maxTotalChars = options?.maxTotalChars ?? 180_000;
  const scopeHeading = options?.scopeHeading?.trim();
  const completeYamlBudget = Math.floor(maxTotalChars * 0.72);
  const hasCompleteYaml = mergedYamlSample.length <= completeYamlBudget;
  const yamlSection = hasCompleteYaml
    ? `## Full YAML (optimizedYaml must be a complete replacement)\n${mergedYamlSample}`
    : `## YAML truncated\nInput is ${mergedYamlSample.length} chars; budget is ${completeYamlBudget}. optimizedYaml must still be non-empty: emit the safest equivalent YAML you can from the indexes below, and explain limits in semanticEquivalence, suggestions, and disclaimer. For a full drop-in file, recommend running AI on a single file or smaller scope.`;

  const remainingBudget = Math.max(12_000, maxTotalChars - yamlSection.length);
  const perKindBudget = Math.floor(remainingBudget / 3);
  const ing = collectKindYaml(indexed, "Ingress", perKindBudget);
  const vs = collectKindYaml(indexed, "VirtualService", perKindBudget);
  const dr = collectKindYaml(indexed, "DestinationRule", perKindBudget);
  const rules = analysis.recommendations
    .map(
      (r) =>
        `- [${r.level}] ${r.kind} ${r.resourceRefs.join(", ")}: ${r.rationale} (Δ lines ≈${r.estimatedLineDelta})`,
    )
    .join("\n");

  const core = clip(
    `## Goal\nCompress VirtualService, DestinationRule, and Ingress YAML with equivalent routing; output full optimizedYaml plus concise guidance.\n\n## Rule engine\n${rules || "(no rule-engine rows)"}\n\n## v1 reminder\n${analysis.v1RulesReminder}\n\n${yamlSection}\n\n## Ingress index\n${ing || "(none)"}\n\n## VirtualService index\n${vs || "(none)"}\n\n## DestinationRule index\n${dr || "(none)"}`,
    maxTotalChars,
  );
  if (!scopeHeading) return core;
  return clip(`## Scope\n${scopeHeading}\n\n${core}`, maxTotalChars);
}

function parseJsonPayload(raw: string): RouteMergeAiPayload {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return parseable JSON");
  }
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  const suggestionsRaw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const stringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    compressionEstimate:
      typeof parsed.compressionEstimate === "string" ? parsed.compressionEstimate : "",
    semanticEquivalence:
      typeof parsed.semanticEquivalence === "string" ? parsed.semanticEquivalence : "",
    optimizationPlan: stringArray(parsed.optimizationPlan),
    changeSummary: stringArray(parsed.changeSummary),
    validationChecklist: stringArray(parsed.validationChecklist),
    ingressDomainNotes: stringArray(parsed.ingressDomainNotes),
    virtualServiceDomainNotes: stringArray(parsed.virtualServiceDomainNotes),
    destinationRuleDomainNotes: stringArray(parsed.destinationRuleDomainNotes),
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
  /** Overrides default system prompt; must still constrain model to JSON compatible with `parseJsonPayload`. */
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.authHeader) headers[cfg.authHeader.name] = cfg.authHeader.value;

  const body: Record<string, unknown> =
    cfg.apiStyle === "azure-responses"
      ? {
          model: cfg.modelId,
          input: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
          temperature: 0.2,
          max_output_tokens: 16384,
        }
      : {
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
          temperature: 0.2,
          max_completion_tokens: 8192,
        };
  if (cfg.apiStyle === "openai-v1") {
    body.model = cfg.modelId;
    body.reasoning_effort = "medium";
  }

  devLog("request", {
    requestUrl: cfg.requestUrl,
    apiStyle: cfg.apiStyle,
    modelId: cfg.modelId,
    apiVersion: cfg.apiVersion,
    authHeader: cfg.authHeader?.name ?? null,
    userChars: userContent.length,
    systemChars: system.length,
  });

  let res = await fetch(cfg.requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const t = await res.text();
    devLog("response:not-ok", {
      status: res.status,
      statusText: res.statusText,
      requestId: res.headers.get("x-ms-request-id") ?? res.headers.get("apim-request-id"),
      bodyPreview: t.slice(0, 1200),
    });
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
      throw new Error(`Azure OpenAI HTTP ${res.status} (${cfg.requestUrl}): ${t.slice(0, 800)}`);
    }
  }

  const json = (await res.json()) as
    | { choices?: { message?: { content?: string | null } }[] }
    | { output_text?: string | null }
    | Record<string, unknown>;
  const content =
    // chat/completions
    typeof (json as any).choices?.[0]?.message?.content === "string"
      ? ((json as any).choices[0].message.content as string)
      : // responses api common shape
        typeof (json as any).output_text === "string"
        ? ((json as any).output_text as string)
        : Array.isArray((json as any).output)
          ? ((json as any).output as any[])
              .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
              .map((part) => (typeof part?.text === "string" ? part.text : ""))
              .join("")
          : null;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Model returned empty content");
  }
  return parseJsonPayload(content);
}
