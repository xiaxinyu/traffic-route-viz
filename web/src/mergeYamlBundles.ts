import type { ParseResult } from "./k8sParser";

export type ImportedYamlFile = { name: string; text: string };

export async function readImportedYamlFiles(files: FileList): Promise<ImportedYamlFile[]> {
  const out: ImportedYamlFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    out.push({ name: f.name, text: await f.text() });
  }
  return out;
}

export function mergeYamlFiles(files: ImportedYamlFile[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0]!.text;
  return files.map((f) => f.text).join("\n---\n");
}

/** 合并多文件单次解析的结构化结果（与单文件语义一致的唯一键策略） */
export function mergeParseResults(results: ParseResult[]): ParseResult {
  const errors: string[] = [];

  const ingressByKey = new Map<string, ParseResult["ingresses"][number]>();
  const routes: ParseResult["routes"] = [];

  const svcByKey = new Map<string, ParseResult["services"][number]>();
  const epByKey = new Map<string, ParseResult["endpoints"][number]>();

  const key = (ns: string | undefined, name: string) => (ns ? `${ns}/${name}` : name);

  for (const r of results) {
    errors.push(...r.errors);
    for (const ing of r.ingresses) {
      const k = key(ing.namespace, ing.name);
      const prev = ingressByKey.get(k);
      if (!prev) {
        ingressByKey.set(k, ing);
      } else {
        const tlsKey = (t: { secretName?: string; hosts: string[] }) =>
          `${t.secretName ?? ""}|${t.hosts.join(",")}`;
        const tlsSeen = new Set(prev.tls.map(tlsKey));
        const tls = [...prev.tls];
        for (const t of ing.tls) {
          const tk = tlsKey(t);
          if (!tlsSeen.has(tk)) {
            tlsSeen.add(tk);
            tls.push(t);
          }
        }
        const loadBalancerIps = [...new Set([...prev.loadBalancerIps, ...ing.loadBalancerIps])];
        const sourceFiles = [...new Set([...(prev.sourceFiles ?? []), ...(ing.sourceFiles ?? [])])];
        ingressByKey.set(k, {
          name: prev.name,
          namespace: prev.namespace ?? ing.namespace,
          className: prev.className ?? ing.className,
          tls,
          loadBalancerIps,
          sourceFiles,
        });
      }
    }

    routes.push(...r.routes);

    for (const s of r.services) {
      const prev = svcByKey.get(s.key);
      if (!prev) {
        svcByKey.set(s.key, s);
      } else {
        svcByKey.set(s.key, {
          ...prev,
          type: prev.type ?? s.type,
          clusterIP: prev.clusterIP ?? s.clusterIP,
          ports: prev.ports.length ? prev.ports : s.ports,
          sourceFiles: [...new Set([...(prev.sourceFiles ?? []), ...(s.sourceFiles ?? [])])],
        });
      }
    }

    for (const e of r.endpoints) {
      const prev = epByKey.get(e.key);
      if (!prev) {
        epByKey.set(e.key, e);
      } else {
        epByKey.set(e.key, {
          ...prev,
          addresses: [...new Set([...prev.addresses, ...e.addresses])],
          ports: prev.ports.length ? prev.ports : e.ports,
          sourceFiles: [...new Set([...(prev.sourceFiles ?? []), ...(e.sourceFiles ?? [])])],
        });
      }
    }
  }

  return {
    ingresses: [...ingressByKey.values()],
    routes,
    services: [...svcByKey.values()],
    endpoints: [...epByKey.values()],
    errors,
  };
}
