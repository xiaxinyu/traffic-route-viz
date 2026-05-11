import { useCallback, useMemo, useState } from "react";

import { mergeParseResults, type ImportedYamlFile } from "../../domain/mergeYamlBundles";
import { parseK8sYaml } from "../../domain/k8sParser";
import { buildRouteMergeAiUserContent, callRouteMergeAi } from "./routeMergeAi";
import {
  resolveRouteMergeAiConfig,
  type RouteMergeAiResolved,
  routeMergeAiDisabledReason,
} from "./routeMergeAiConfig";
import { resolveRouteMergeAiSystemPrompt } from "./routeMergeAiPrompt";
import { analyzeRouteMerge } from "./routeMergeRecommend";
import { buildIndexedDocCorpus, corpusMergedYaml } from "./routeMergeRawDocs";
import type { RouteMergeAiPayload } from "./routeMergeTypes";

export function useRouteMergeAi(yamlText: string, importedFiles: ImportedYamlFile[] | null) {
  const parseResult = useMemo(() => {
    if (importedFiles?.length) {
      return mergeParseResults(importedFiles.map((f) => parseK8sYaml(f.text, f.relPath ?? f.name)));
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

  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [payload, setPayload] = useState<RouteMergeAiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [sourceYaml, setSourceYaml] = useState("");
  const [previewUserContent, setPreviewUserContent] = useState<string>("");
  const [preparedUserContent, setPreparedUserContent] = useState<string>("");
  const [preparedCfg, setPreparedCfg] = useState<RouteMergeAiResolved | null>(null);

  const prepareAll = useCallback(() => {
    const cfg = resolveRouteMergeAiConfig();
    setModalOpen(true);
    setPayload(null);
    setError(null);
    setSourceYaml(mergedYaml);
    setScopeLabel(
      importedFiles?.length ? "全部已导入文件（合并视图）" : "当前编辑区 YAML（未使用多文件导入）",
    );
    if (!cfg) {
      setPreparedCfg(null);
      setPreviewUserContent("");
      setPreparedUserContent("");
      setError(routeMergeAiDisabledReason());
      return;
    }
    const scopeHeading = importedFiles?.length
      ? "当前为**合并视图**：目标是压缩所有已导入文件中的 VS/DR/Ingress，并保持功能等价。若输入过大无法完整发送，仍须输出非空 optimizedYaml，并明确建议用户按单文件运行以得到完整可替换结果。"
      : "当前为**仅编辑器 YAML**（未使用多文件导入）。目标是压缩当前 YAML 内的 VS/DR/Ingress，optimizedYaml 必须是完整可替换的新 YAML；不要假设存在未出现在 YAML 中的其它资源。";
    const user = buildRouteMergeAiUserContent(analysis, indexed, mergedYaml, { scopeHeading });
    setPreparedCfg(cfg);
    setPreparedUserContent(user);
    setPreviewUserContent(mergedYaml);
  }, [analysis, importedFiles, indexed, mergedYaml]);

  const prepareForImportedFileIndex = useCallback(
    (index: number) => {
      const cfg = resolveRouteMergeAiConfig();
      setModalOpen(true);
      setPayload(null);
      setError(null);
      if (!importedFiles?.length) {
        setSourceYaml("");
        setPreparedCfg(null);
        setPreviewUserContent("");
        setPreparedUserContent("");
        setError("未导入文件，无法按单文件分析。");
        return;
      }
      const f = importedFiles[index];
      if (!f) {
        setSourceYaml("");
        setPreparedCfg(null);
        setPreviewUserContent("");
        setPreparedUserContent("");
        setError("文件索引无效。");
        return;
      }
      if (!cfg) {
        setPreparedCfg(null);
        setPreviewUserContent("");
        setPreparedUserContent("");
        setError(routeMergeAiDisabledReason());
        return;
      }
      const fileKey = f.relPath ?? f.name;
      setScopeLabel(`单个文件：${fileKey}`);
      const indexedSubset = indexed.filter((d) => d.sourceFile === fileKey);
      const pr = mergeParseResults([parseK8sYaml(f.text, fileKey)]);
      const analysisSubset = analyzeRouteMerge(pr, indexedSubset);
      const mergedFile = f.text;
      setSourceYaml(mergedFile);
      const scopeHeading = `仅分析导入文件 \`${fileKey}\`。目标是压缩该文件内的 VS/DR/Ingress 并保持功能等价；optimizedYaml 必须输出该文件完整可替换的新 YAML；不要臆测其它导入文件中的资源。`;
      const user = buildRouteMergeAiUserContent(analysisSubset, indexedSubset, mergedFile, {
        scopeHeading,
      });
      setPreparedCfg(cfg);
      setPreparedUserContent(user);
      setPreviewUserContent(mergedFile);
    },
    [importedFiles, indexed],
  );

  const runPrepared = useCallback(async () => {
    if (!preparedCfg) {
      setError(routeMergeAiDisabledReason());
      return;
    }
    if (!preparedUserContent.trim()) {
      setError("预览输入为空，无法发起 AI 请求。");
      return;
    }
    setBusy(true);
    setPayload(null);
    setError(null);
    try {
      const out = await callRouteMergeAi(preparedCfg, preparedUserContent, undefined, {
        systemPrompt: resolveRouteMergeAiSystemPrompt(),
      });
      setPayload(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [preparedCfg, preparedUserContent]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  return {
    busy,
    modalOpen,
    closeModal,
    payload,
    error,
    scopeLabel,
    sourceYaml,
    previewUserContent,
    prepareAll,
    prepareForImportedFileIndex,
    runPrepared,
  };
}
