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
    setScopeLabel(importedFiles?.length ? "All imported files (merged view)" : "Editor YAML (single buffer)");
    if (!cfg) {
      setPreparedCfg(null);
      setPreviewUserContent("");
      setPreparedUserContent("");
      setError(routeMergeAiDisabledReason());
      return;
    }
    const scopeHeading = importedFiles?.length
      ? "**Merged view:** compress VS/DR/Ingress across all imported files with equivalent behavior. If input is too large to send fully, still return non-empty optimizedYaml and tell the user to run per-file for a complete drop-in."
      : "**Editor only:** compress VS/DR/Ingress inside the current YAML; optimizedYaml must be a full replacement; do not assume resources not present in the buffer.";
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
        setError("No imported files; per-file analysis unavailable.");
        return;
      }
      const f = importedFiles[index];
      if (!f) {
        setSourceYaml("");
        setPreparedCfg(null);
        setPreviewUserContent("");
        setPreparedUserContent("");
        setError("Invalid file index.");
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
      setScopeLabel(`File: ${fileKey}`);
      const indexedSubset = indexed.filter((d) => d.sourceFile === fileKey);
      const pr = mergeParseResults([parseK8sYaml(f.text, fileKey)]);
      const analysisSubset = analyzeRouteMerge(pr, indexedSubset);
      const mergedFile = f.text;
      setSourceYaml(mergedFile);
      const scopeHeading = `Analyze imported file \`${fileKey}\` only. Compress VS/DR/Ingress inside that file; optimizedYaml must be a full replacement for that file; do not assume resources from other imports.`;
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
      setError("Preview input is empty; cannot call AI.");
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
