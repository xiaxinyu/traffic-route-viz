import { useCallback, useMemo, useState } from "react";

import { buildFlowGraph } from "./buildGraph";
import { mergeParseResults, type ImportedYamlFile } from "./mergeYamlBundles";
import { parseK8sYaml } from "./k8sParser";
import { buildRouteMergeAiUserContent, callRouteMergeAi } from "./routeMergeAi";
import { resolveRouteMergeAiConfig, routeMergeAiDisabledReason } from "./routeMergeAiConfig";
import { analyzeRouteMerge } from "./routeMergeRecommend";
import { buildIndexedDocCorpus, corpusMergedYaml } from "./routeMergeRawDocs";
import type { RouteMergeAiPayload } from "./routeMergeTypes";

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function validateYamlForGraph(yaml: string): { ok: boolean; detail: string } {
  const trimmed = yaml.trim();
  if (!trimmed) return { ok: true, detail: "空内容" };
  try {
    const p = parseK8sYaml(trimmed);
    buildFlowGraph(p);
    const warn = p.errors.length ? `（解析告警 ${p.errors.length} 条）` : "";
    return { ok: true, detail: `可解析并构图 ${warn}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export function RouteMergePanel(props: {
  yamlText: string;
  importedFiles: ImportedYamlFile[] | null;
}) {
  const { yamlText, importedFiles } = props;

  const parseResult = useMemo(() => {
    if (importedFiles?.length) {
      return mergeParseResults(
        importedFiles.map((f) => parseK8sYaml(f.text, f.relPath ?? f.name)),
      );
    }
    return parseK8sYaml(yamlText);
  }, [yamlText, importedFiles]);

  const indexed = useMemo(
    () => buildIndexedDocCorpus(yamlText, importedFiles),
    [yamlText, importedFiles],
  );

  const mergedYaml = useMemo(
    () => corpusMergedYaml(yamlText, importedFiles),
    [yamlText, importedFiles],
  );

  const analysis = useMemo(() => analyzeRouteMerge(parseResult, indexed), [parseResult, indexed]);
  const [aiPayload, setAiPayload] = useState<RouteMergeAiPayload | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const aiCfg = resolveRouteMergeAiConfig();
  const aiHint = aiCfg ? null : routeMergeAiDisabledReason();

  const runAi = useCallback(async () => {
    if (!aiCfg) return;
    setAiBusy(true);
    setAiError(null);
    setAiPayload(null);
    try {
      const user = buildRouteMergeAiUserContent(analysis, indexed, mergedYaml);
      const out = await callRouteMergeAi(aiCfg, user);
      setAiPayload(out);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }, [aiCfg, analysis, indexed, mergedYaml]);

  const aiYamlCheck = useMemo(() => {
    if (!aiPayload?.optimizedYaml?.trim()) return null;
    return validateYamlForGraph(aiPayload.optimizedYaml);
  }, [aiPayload]);

  return (
    <section className="left-panel-block compact route-merge-panel">
      <div className="block-title-row">
        <div>
          <div className="block-title">路由合并建议（v1）</div>
          <div className="block-subtitle">dry-run；不修改编辑器；AI 可选且需自行配置密钥/代理</div>
        </div>
      </div>

      <div className="route-merge-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={!aiCfg || aiBusy}
          title={aiHint ?? "调用已配置的 Azure OpenAI"}
          onClick={() => void runAi()}
        >
          {aiBusy ? "AI 请求中…" : "AI 优化建议"}
        </button>
      </div>
      <div className="route-merge-auto-hint">规则引擎结果随当前 YAML / 导入自动更新。</div>
      {aiHint ? <div className="route-merge-hint">{aiHint}</div> : null}

      <div className="route-merge-v1">{analysis.v1RulesReminder}</div>

      <ul className="route-merge-list">
        {analysis.recommendations.map((r) => (
          <li key={r.id} className={`route-merge-item level-${r.level}`}>
            <div className="route-merge-item-head">
              <span className="route-merge-badge">{r.level}</span>
              <span className="route-merge-kind">{r.kind}</span>
            </div>
            <div className="route-merge-rationale">{r.rationale}</div>
            {r.resourceRefs.length ? (
              <div className="route-merge-refs">{r.resourceRefs.join(" · ")}</div>
            ) : null}
            {r.warnings.length ? (
              <ul className="route-merge-warn">
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            {r.candidateYaml ? (
              <div className="route-merge-candidate-actions">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => void navigator.clipboard.writeText(r.candidateYaml!)}
                >
                  复制候选 YAML
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() =>
                    downloadText(`route-merge-${r.id}.yaml`, r.candidateYaml!, "text/yaml;charset=utf-8")
                  }
                >
                  下载
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {aiPayload ? (
        <div className="route-merge-ai">
          <div className="route-merge-ai-title">AI 输出</div>
          {aiPayload.summary ? <p className="route-merge-ai-summary">{aiPayload.summary}</p> : null}
          {aiPayload.ingressDomainNotes.length ? (
            <div className="route-merge-ai-block">
              <strong>Ingress</strong>
              <ul>
                {aiPayload.ingressDomainNotes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {aiPayload.virtualServiceDomainNotes.length ? (
            <div className="route-merge-ai-block">
              <strong>VirtualService</strong>
              <ul>
                {aiPayload.virtualServiceDomainNotes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {aiPayload.destinationRuleDomainNotes.length ? (
            <div className="route-merge-ai-block">
              <strong>DestinationRule</strong>
              <ul>
                {aiPayload.destinationRuleDomainNotes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {aiPayload.suggestions.length ? (
            <ul className="route-merge-ai-suggestions">
              {aiPayload.suggestions.map((s, i) => (
                <li key={`${s.title}-${i}`}>
                  <strong>{s.title}</strong> {s.risk ? <span className="route-merge-risk">({s.risk})</span> : null}
                  <div>{s.detail}</div>
                </li>
              ))}
            </ul>
          ) : null}
          {aiPayload.optimizedYaml.trim() ? (
            <>
              <div className="route-merge-ai-yaml-actions">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => void navigator.clipboard.writeText(aiPayload.optimizedYaml)}
                >
                  复制 AI 优化 YAML
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() =>
                    downloadText(
                      `route-merge-ai-${Date.now()}.yaml`,
                      aiPayload.optimizedYaml,
                      "text/yaml;charset=utf-8",
                    )
                  }
                >
                  下载
                </button>
              </div>
              {aiYamlCheck ? (
                <div className={aiYamlCheck.ok ? "route-merge-validate ok" : "route-merge-validate bad"}>
                  本地校验：{aiYamlCheck.detail}
                </div>
              ) : null}
              <pre className="route-merge-ai-pre">{aiPayload.optimizedYaml}</pre>
            </>
          ) : null}
          {aiPayload.disclaimer ? (
            <div className="route-merge-disclaimer">{aiPayload.disclaimer}</div>
          ) : null}
        </div>
      ) : null}

      {aiError ? <div className="route-merge-error">{aiError}</div> : null}
    </section>
  );
}
