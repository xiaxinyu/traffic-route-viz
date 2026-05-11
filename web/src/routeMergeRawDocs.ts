import { parseAllDocuments, stringify } from "yaml";

import type { ImportedYamlFile } from "./mergeYamlBundles";
import { mergeYamlFiles } from "./mergeYamlBundles";

export type RawK8sObject = Record<string, unknown>;

function asRecord(v: unknown): RawK8sObject | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as RawK8sObject) : null;
}

export type IndexedRawDoc = {
  /** Ingress:default/name or VirtualService:ns/name */
  refKey: string;
  kind: string;
  apiVersion: string | undefined;
  namespace: string | undefined;
  name: string | undefined;
  yaml: string;
  obj: RawK8sObject;
  sourceFile?: string;
};

function resourceRefKey(kind: string, ns: string | undefined, name: string | undefined): string {
  const n = name ?? "(noname)";
  return `${kind}:${ns ? `${ns}/${n}` : n}`;
}

/**
 * Parse YAML text into per-document records with round-trip YAML for candidate generation.
 */
export function extractIndexedDocsFromText(text: string, sourceFile?: string): IndexedRawDoc[] {
  if (!text.trim()) return [];
  const out: IndexedRawDoc[] = [];
  try {
    const docs = parseAllDocuments(text);
    for (const doc of docs) {
      const js = doc.toJS();
      const o = asRecord(js);
      if (!o) continue;
      const kind = o.kind;
      if (typeof kind !== "string") continue;
      const meta = asRecord(o.metadata);
      const name = typeof meta?.name === "string" ? meta.name : undefined;
      const namespace = typeof meta?.namespace === "string" ? meta.namespace : undefined;
      const apiVersion = typeof o.apiVersion === "string" ? o.apiVersion : undefined;
      try {
        const yaml = stringify(doc).trimEnd();
        out.push({
          refKey: resourceRefKey(kind, namespace, name),
          kind,
          apiVersion,
          namespace,
          name,
          yaml,
          obj: o,
          sourceFile,
        });
      } catch {
        // skip non-serializable
      }
    }
  } catch {
    return [];
  }
  return out;
}

/** Merge context: all imported files + optional single-editor fallback. */
export function buildIndexedDocCorpus(
  yamlText: string,
  importedFiles: ImportedYamlFile[] | null,
): IndexedRawDoc[] {
  const acc: IndexedRawDoc[] = [];
  if (importedFiles?.length) {
    for (const f of importedFiles) {
      acc.push(...extractIndexedDocsFromText(f.text, f.relPath ?? f.name));
    }
    return acc;
  }
  return extractIndexedDocsFromText(yamlText, undefined);
}

export function indexDocsByRef(docs: IndexedRawDoc[]): Map<string, IndexedRawDoc> {
  const m = new Map<string, IndexedRawDoc>();
  for (const d of docs) {
    m.set(d.refKey, d);
  }
  return m;
}

/** Combined YAML string for LLM / display (same as editor merge). */
export function corpusMergedYaml(yamlText: string, importedFiles: ImportedYamlFile[] | null): string {
  if (importedFiles?.length) return mergeYamlFiles(importedFiles);
  return yamlText;
}
