import { stringify } from "yaml";

import type { ParseResult } from "../../domain/k8sParser";
import type { IndexedRawDoc, RawK8sObject } from "./routeMergeRawDocs";
import { shallowStableJsonRecord } from "./routeMergeJson";
import type { RouteMergeAnalysis, RouteMergeRecommendation } from "./routeMergeTypes";

function asRecord(v: unknown): RawK8sObject | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as RawK8sObject) : null;
}

const V1_REMINDER =
  "v1 边界：仅同 namespace、同 Ingress class / 同 VS hosts+gateways；不处理 Gateway API；dry-run；冲突不生成 YAML。";

type PathEntry = {
  path: string;
  pathType: string;
  serviceName: string;
  servicePort: number | string;
};

function readIngressPaths(ing: RawK8sObject): Map<string, PathEntry[]> {
  const byHost = new Map<string, PathEntry[]>();
  const spec = asRecord(ing.spec);
  const rules = Array.isArray(spec?.rules) ? spec!.rules! : [];
  for (const rule of rules) {
    const r = asRecord(rule);
    const host = typeof r?.host === "string" ? r.host : "*";
    const http = asRecord(r?.http);
    const paths = Array.isArray(http?.paths) ? http.paths : [];
    const list: PathEntry[] = byHost.get(host) ?? [];
    for (const p of paths) {
      const po = asRecord(p);
      const backend = asRecord(po?.backend);
      const svc = asRecord(backend?.service);
      const portObj = asRecord(svc?.port);
      const serviceName = typeof svc?.name === "string" ? svc.name : "?";
      let servicePort: number | string = "?";
      if (typeof portObj?.number === "number") servicePort = portObj.number;
      else if (typeof portObj?.name === "string") servicePort = portObj.name;
      const path = typeof po?.path === "string" ? po.path : "/";
      const pathType = typeof po?.pathType === "string" ? po.pathType : "ImplementationSpecific";
      list.push({ path, pathType, serviceName, servicePort });
    }
    byHost.set(host, list);
  }
  return byHost;
}

function ingressMeta(ing: RawK8sObject) {
  const meta = asRecord(ing.metadata);
  const name = typeof meta?.name === "string" ? meta.name : "(noname)";
  const ns = typeof meta?.namespace === "string" ? meta.namespace : undefined;
  const spec = asRecord(ing.spec);
  const className = typeof spec?.ingressClassName === "string" ? spec.ingressClassName : "";
  const annotations = asRecord(meta?.annotations) ?? {};
  const tls = spec?.tls;
  const defaultBackend = spec?.defaultBackend;
  return { name, ns, className, annotations, tls, defaultBackend };
}

function tlsFingerprint(tls: unknown): string {
  if (!Array.isArray(tls)) return "[]";
  return JSON.stringify(
    tls.map((t) => {
      const o = asRecord(t);
      return {
        hosts: Array.isArray(o?.hosts) ? [...(o!.hosts as string[])].sort() : [],
        secretName: typeof o?.secretName === "string" ? o.secretName : "",
      };
    }),
  );
}

function pathKey(p: PathEntry): string {
  return `${p.path}\u0000${p.pathType}`;
}

function tryMergeIngressGroup(
  docs: IndexedRawDoc[],
  host: string,
): { rec: RouteMergeRecommendation | null } {
  if (docs.length < 2) return { rec: null };

  for (const d of docs) {
    const hm = readIngressPaths(d.obj);
    if (hm.size !== 1 || !hm.has(host)) {
      return {
        rec: reviewIngress(
          docs,
          host,
          "某 Ingress 仍包含其它 host 的规则；v1 合并单 host 会丢失其它 host → 不生成候选 YAML。",
        ),
      };
    }
  }

  const metas = docs.map((d) => ingressMeta(d.obj));
  const ns0 = metas[0]!.ns;
  if (!metas.every((m) => m.ns === ns0)) {
    return {
      rec: blockedIngress(docs, host, "跨 namespace，标记为 Blocked。"),
    };
  }
  const class0 = metas[0]!.className;
  if (!metas.every((m) => m.className === class0)) {
    return {
      rec: blockedIngress(docs, host, "ingressClassName 不一致，无法安全合并。"),
    };
  }

  const ann0 = shallowStableJsonRecord(metas[0]!.annotations);
  if (!metas.every((m) => shallowStableJsonRecord(m.annotations) === ann0)) {
    return {
      rec: reviewIngress(docs, host, "metadata.annotations 不一致，仅给建议，不生成候选 YAML。"),
    };
  }

  const tls0 = tlsFingerprint(metas[0]!.tls);
  if (!metas.every((m) => tlsFingerprint(m.tls) === tls0)) {
    return {
      rec: reviewIngress(docs, host, "spec.tls 不一致，需人工核对后再合并。"),
    };
  }

  const db0 = shallowStableJsonRecord(metas[0]!.defaultBackend);
  if (!metas.every((m) => shallowStableJsonRecord(m.defaultBackend) === db0)) {
    return {
      rec: reviewIngress(docs, host, "defaultBackend 不一致，不生成候选 YAML。"),
    };
  }

  const pathMap = new Map<string, PathEntry>();
  const conflicts: string[] = [];
  for (const d of docs) {
    const byHost = readIngressPaths(d.obj);
    const paths = byHost.get(host) ?? [];
    if (!paths.length) {
      conflicts.push(`${ingressMeta(d.obj).name} 未包含 host ${host} 的规则`);
      continue;
    }
    for (const p of paths) {
      const k = pathKey(p);
      const prev = pathMap.get(k);
      if (!prev) {
        pathMap.set(k, p);
      } else if (
        prev.serviceName !== p.serviceName ||
        String(prev.servicePort) !== String(p.servicePort)
      ) {
        conflicts.push(
          `路径冲突 ${host} ${p.path} (${p.pathType}) → ${prev.serviceName} vs ${p.serviceName}`,
        );
      }
    }
  }

  if (conflicts.length) {
    return {
      rec: {
        id: `ingress-blocked-${host}-${docs.map((d) => ingressMeta(d.obj).name).join("-")}`,
        kind: "Ingress",
        level: "blocked",
        resourceRefs: docs.map((d) => `Ingress:${d.namespace ?? "default"}/${d.name}`),
        rationale: `同 host ${host} 的 Ingress 存在冲突或不完整规则。`,
        estimatedLineDelta: 0,
        warnings: conflicts,
        impact: {
          keptResources: docs.map((d) => d.name ?? ""),
          riskLabel: "blocked",
        },
      },
    };
  }

  const base = structuredClone(docs[0]!.obj) as RawK8sObject;
  const baseMeta = asRecord(base.metadata) ?? {};
  const mergedName = `${metas[0]!.name}-merged-candidate`;
  baseMeta.name = mergedName;
  if (ns0) baseMeta.namespace = ns0;
  base.metadata = baseMeta;

  const baseSpec = asRecord(base.spec) ?? {};
  const rules = Array.isArray(baseSpec.rules) ? [...baseSpec.rules!] : [];
  const ruleForHost = rules.find((r) => asRecord(r)?.host === host);
  const httpObj = ruleForHost ? asRecord(asRecord(ruleForHost)?.http) : null;
  if (!httpObj || !Array.isArray(httpObj.paths)) {
    return {
      rec: reviewIngress(docs, host, "无法在原始结构上定位 host 对应的 http.paths，降级 Review。"),
    };
  }

  const mergedPaths: PathEntry[] = [...pathMap.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  httpObj.paths = mergedPaths.map((p) => ({
    path: p.path,
    pathType: p.pathType,
    backend: {
      service: {
        name: p.serviceName,
        port:
          typeof p.servicePort === "number"
            ? { number: p.servicePort }
            : { name: String(p.servicePort) },
      },
    },
  }));
  baseSpec.rules = [{ host, http: httpObj }];
  base.spec = baseSpec;

  let yamlOut: string;
  try {
    yamlOut = stringify(base).trimEnd();
  } catch {
    return {
      rec: reviewIngress(docs, host, "候选对象序列化失败，不生成 YAML。"),
    };
  }

  const lineApprox =
    docs.reduce((s, d) => s + d.yaml.split("\n").length, 0) - yamlOut.split("\n").length;

  return {
    rec: {
      id: `ingress-safe-${host}-${mergedName}`,
      kind: "Ingress",
      level: "safe",
      resourceRefs: docs.map((d) => `Ingress:${d.namespace ?? "default"}/${d.name}`),
      rationale: `可将 ${docs.length} 个 Ingress 在 host「${host}」上的路径合并为单个 Ingress（${mergedName}）。`,
      estimatedLineDelta: Math.max(0, lineApprox),
      warnings: [
        "请在集群中核对 annotations / finalizers / 依赖后再应用。",
        "候选名称带 -merged-candidate 后缀，避免与现网资源冲突。",
      ],
      candidateYaml: `${yamlOut}\n`,
      impact: {
        keptResources: docs.map((d) => d.name ?? ""),
        mergedIntoName: mergedName,
        riskLabel: "safe (v1)",
      },
    },
  };
}

function blockedIngress(docs: IndexedRawDoc[], host: string, why: string): RouteMergeRecommendation {
  return {
    id: `ingress-blocked-${host}`,
    kind: "Ingress",
    level: "blocked",
    resourceRefs: docs.map((d) => `Ingress:${d.namespace ?? "default"}/${d.name}`),
    rationale: why,
    estimatedLineDelta: 0,
    warnings: [],
  };
}

function reviewIngress(docs: IndexedRawDoc[], host: string, why: string): RouteMergeRecommendation {
  return {
    id: `ingress-review-${host}`,
    kind: "Ingress",
    level: "review",
    resourceRefs: docs.map((d) => `Ingress:${d.namespace ?? "default"}/${d.name}`),
    rationale: why,
    estimatedLineDelta: 0,
    warnings: ["请人工合并或拆分后再导入验证。"],
    impact: {
      keptResources: docs.map((d) => d.name ?? ""),
      riskLabel: "review",
    },
  };
}

function hostsKey(vs: RawK8sObject): string {
  const spec = asRecord(vs.spec);
  const hosts = Array.isArray(spec?.hosts) ? spec!.hosts!.filter((h): h is string => typeof h === "string") : [];
  return JSON.stringify([...hosts].sort());
}

function gatewaysKey(vs: RawK8sObject): string {
  const spec = asRecord(vs.spec);
  const gw = spec?.gateways;
  if (!Array.isArray(gw)) return JSON.stringify([]);
  const list = gw.filter((g): g is string => typeof g === "string");
  return JSON.stringify([...list].sort());
}

function vsForbiddenSpecKeys(spec: RawK8sObject | null): string[] {
  if (!spec) return [];
  const forbidden = ["tcp", "tls", "exportTo", "delegate", "mirror"];
  return forbidden.filter((k) => spec[k] !== undefined && spec[k] !== null);
}

function tryMergeVsGroup(docs: IndexedRawDoc[]): { rec: RouteMergeRecommendation | null } {
  if (docs.length < 2) return { rec: null };
  const ns0 = docs[0]!.namespace;
  if (!docs.every((d) => d.namespace === ns0)) {
    return {
      rec: {
        id: "vs-blocked-ns",
        kind: "VirtualService",
        level: "blocked",
        resourceRefs: docs.map((d) => `VirtualService:${d.namespace ?? "default"}/${d.name}`),
        rationale: "跨 namespace VirtualService 不在 v1 合并范围。",
        estimatedLineDelta: 0,
        warnings: [],
      },
    };
  }

  const h0 = hostsKey(docs[0]!.obj);
  const g0 = gatewaysKey(docs[0]!.obj);
  if (!docs.every((d) => hostsKey(d.obj) === h0 && gatewaysKey(d.obj) === g0)) {
    return {
      rec: {
        id: "vs-blocked-host-gw",
        kind: "VirtualService",
        level: "blocked",
        resourceRefs: docs.map((d) => `VirtualService:${d.namespace ?? "default"}/${d.name}`),
        rationale: "hosts 或 gateways 集合不一致，不能按 v1 合并。",
        estimatedLineDelta: 0,
        warnings: [],
      },
    };
  }

  const httpComplexKeys = ["corsPolicy", "retries", "fault", "timeout", "mirror", "headers"];
  for (const d of docs) {
    const spec = asRecord(d.obj.spec);
    const http = Array.isArray(spec?.http) ? spec!.http! : [];
    for (const block of http) {
      const b = asRecord(block);
      if (!b) continue;
      const hit = httpComplexKeys.filter((k) => b[k] !== undefined && b[k] !== null);
      if (hit.length) {
        return {
          rec: {
            id: `vs-review-http-${d.name}`,
            kind: "VirtualService",
            level: "review",
            resourceRefs: docs.map((x) => `VirtualService:${x.namespace ?? "default"}/${x.name}`),
            rationale: `http 路由存在未在 v1 完整建模的字段：${hit.join(", ")} → 不生成候选 YAML。`,
            estimatedLineDelta: 0,
            warnings: [],
          },
        };
      }
    }
  }

  for (const d of docs) {
    const spec = asRecord(d.obj.spec);
    const bad = vsForbiddenSpecKeys(spec);
    if (bad.length) {
      return {
        rec: {
          id: `vs-review-${d.name}-complex`,
          kind: "VirtualService",
          level: "review",
          resourceRefs: docs.map((x) => `VirtualService:${x.namespace ?? "default"}/${x.name}`),
          rationale: `存在 v1 未覆盖的 spec 字段：${bad.join(", ")}，仅输出建议。`,
          estimatedLineDelta: 0,
          warnings: ["需保留 mirror/timeout/retries 等字段时请人工合并。"],
        },
      };
    }
  }

  const httpBlocks: unknown[] = [];
  const routeNameSeen = new Set<string>();
  const matchFingerprints = new Set<string>();

  for (const d of docs) {
    const spec = asRecord(d.obj.spec);
    const http = Array.isArray(spec?.http) ? spec!.http! : [];
    for (const block of http) {
      const b = asRecord(block);
      const name = typeof b?.name === "string" ? b.name : "";
      const fp = shallowStableJsonRecord(b?.match ?? {});
      const dests = Array.isArray(b?.route) ? b!.route : [];
      const destFp = shallowStableJsonRecord(dests);
      const key = `${fp}@@${destFp}`;
      if (matchFingerprints.has(key)) continue;
      const dedupeName = name && routeNameSeen.has(name) ? `${name}-from-${d.name}` : name;
      if (name) routeNameSeen.add(dedupeName || name);
      matchFingerprints.add(key);
      const clone = structuredClone(block) as RawK8sObject;
      if (dedupeName && dedupeName !== name) {
        clone.name = dedupeName;
      }
      httpBlocks.push(clone);
    }
  }

  const base = structuredClone(docs[0]!.obj) as RawK8sObject;
  const meta = asRecord(base.metadata) ?? {};
  const mergedName = `${docs[0]!.name}-merged-candidate`;
  meta.name = mergedName;
  if (ns0) meta.namespace = ns0;
  base.metadata = meta;
  const spec = asRecord(base.spec) ?? {};
  spec.http = httpBlocks;
  base.spec = spec;

  let yamlOut: string;
  try {
    yamlOut = stringify(base).trimEnd();
  } catch {
    return {
      rec: {
        id: "vs-review-serialize",
        kind: "VirtualService",
        level: "review",
        resourceRefs: docs.map((d) => `VirtualService:${d.namespace ?? "default"}/${d.name}`),
        rationale: "VirtualService 候选序列化失败。",
        estimatedLineDelta: 0,
        warnings: [],
      },
    };
  }

  const lineApprox =
    docs.reduce((s, d) => s + d.yaml.split("\n").length, 0) - yamlOut.split("\n").length;

  return {
    rec: {
      id: `vs-safe-${mergedName}`,
      kind: "VirtualService",
      level: "safe",
      resourceRefs: docs.map((d) => `VirtualService:${d.namespace ?? "default"}/${d.name}`),
      rationale: `可将 ${docs.length} 个 VirtualService（相同 hosts/gateways）合并为 ${mergedName}。`,
      estimatedLineDelta: Math.max(0, lineApprox),
      warnings: [
        "已按 match+route 去重；若依赖 http 顺序或 fault/retries 等未建模字段，请人工复核。",
      ],
      candidateYaml: `${yamlOut}\n`,
      impact: {
        keptResources: docs.map((d) => d.name ?? ""),
        mergedIntoName: mergedName,
        riskLabel: "safe (v1)",
      },
    },
  };
}

/**
 * Deterministic v1 analysis: Ingress (per host) and VirtualService groups.
 */
export function analyzeRouteMerge(
  parseResult: ParseResult,
  indexed: IndexedRawDoc[],
): RouteMergeAnalysis {
  const recommendations: RouteMergeRecommendation[] = [];

  const ingressDocs = indexed.filter((d) => d.kind === "Ingress");
  const vsDocs = indexed.filter((d) => d.kind === "VirtualService");

  // Ingress: group by ns + class + host
  const hostToIngs = new Map<string, { host: string; docs: IndexedRawDoc[] }>();
  for (const d of ingressDocs) {
    const byHost = readIngressPaths(d.obj);
    const m = ingressMeta(d.obj);
    for (const host of byHost.keys()) {
      const key = `${m.ns ?? ""}\u0000${m.className}\u0000${host}`;
      let bucket = hostToIngs.get(key);
      if (!bucket) {
        bucket = { host, docs: [] };
        hostToIngs.set(key, bucket);
      }
      bucket.docs.push(d);
    }
  }
  for (const { host, docs: group } of hostToIngs.values()) {
    const unique = [...new Map(group.map((g) => [g.refKey, g])).values()];
    if (unique.length < 2) continue;
    const { rec } = tryMergeIngressGroup(unique, host);
    if (rec) recommendations.push(rec);
  }

  // VirtualService groups: ns + hostsKey + gatewaysKey
  const vsGroups = new Map<string, IndexedRawDoc[]>();
  for (const d of vsDocs) {
    const k = `${d.namespace ?? ""}|${hostsKey(d.obj)}|${gatewaysKey(d.obj)}`;
    if (!vsGroups.has(k)) vsGroups.set(k, []);
    vsGroups.get(k)!.push(d);
  }
  for (const [, group] of vsGroups) {
    const unique = [...new Map(group.map((g) => [g.refKey, g])).values()];
    if (unique.length < 2) continue;
    const { rec } = tryMergeVsGroup(unique);
    if (rec) recommendations.push(rec);
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "noop",
      kind: "Ingress",
      level: "review",
      resourceRefs: [],
      rationale:
        parseResult.errors.length
          ? "当前解析存在告警，未生成合并候选；修复 YAML 后可重试。"
          : "未发现满足 v1 安全边界的重复 Ingress host 分组或重复 VirtualService 分组。",
      estimatedLineDelta: 0,
      warnings: [],
    });
  }

  return { recommendations, v1RulesReminder: V1_REMINDER };
}
