import { useMemo } from "react";

import { mergeParseResults, type ImportedYamlFile } from "../../domain/mergeYamlBundles";
import { parseK8sYaml } from "../../domain/k8sParser";
import { analyzeRouteMerge } from "./routeMergeRecommend";
import { buildIndexedDocCorpus } from "./routeMergeRawDocs";
import type { RouteMergeAnalysis } from "./routeMergeTypes";

export function useRouteMergeAnalysis(
  yamlText: string,
  importedFiles: ImportedYamlFile[] | null,
): RouteMergeAnalysis {
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

  return useMemo(() => analyzeRouteMerge(parseResult, indexed), [parseResult, indexed]);
}
