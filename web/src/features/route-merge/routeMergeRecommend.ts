import { stringify } from "yaml";

import type { ParseResult } from "../../domain/k8sParser";
import type { IndexedRawDoc, RawK8sObject } from "./routeMergeRawDocs";
import { shallowStableJsonRecord } from "./routeMergeJson";
import type { RouteMergeAnalysis, RouteMergeRecommendation } from "./routeMergeTypes";

function asRecord(v: unknown): RawK8sObject | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as RawK8sObject) : null;
}

const V1_REMINDER =
  "v1 scope: same namespace; same Ingress class or same VirtualService hosts+gateways; no Gateway API; dry-run; conflicts skip YAML.";

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
          "An Ingress still has rules for other hosts; merging one host would drop them → no candidate YAML.",
        ),
      };
    }
  }

  const metas = docs.map((d) => ingressMeta(d.obj));
  const ns0 = metas[0]!.ns;
  if (!metas.every((m) => m.ns === ns0)) {
    return {
      rec: blockedIngress(docs, host, "Different namespaces → Blocked."),
    };
  }
  const class0 = metas[0]!.className;
  if (!metas.every((m) => m.className === class0)) {
    return {
      rec: blockedIngress(docs, host, "ingressClassName differs; cannot merge safely."),
    };
  }

  const ann0 = shallowStableJsonRecord(metas[0]!.annotations);
  if (!metas.every((m) => shallowStableJsonRecord(m.annotations) === ann0)) {
    return {
      rec: reviewIngress(docs, host, "metadata.annotations differ; suggestions only, no candidate YAML."),
    };
  }

  const tls0 = tlsFingerprint(metas[0]!.tls);
  if (!metas.every((m) => tlsFingerprint(m.tls) === tls0)) {
    return {
      rec: reviewIngress(docs, host, "spec.tls differs; verify manually before merging."),
    };
  }

  const db0 = shallowStableJsonRecord(metas[0]!.defaultBackend);
  if (!metas.every((m) => shallowStableJsonRecord(m.defaultBackend) === db0)) {
    return {
      rec: reviewIngress(docs, host, "defaultBackend differs; no candidate YAML."),
    };
  }

  const pathMap = new Map<string, PathEntry>();
  const conflicts: string[] = [];
  for (const d of docs) {
    const byHost = readIngressPaths(d.obj);
    const paths = byHost.get(host) ?? [];
    if (!paths.length) {
      conflicts.push(`${ingressMeta(d.obj).name} has no rules for host ${host}`);
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
          `Path conflict ${host} ${p.path} (${p.pathType}) → ${prev.serviceName} vs ${p.serviceName}`,
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
        rationale: `Ingress rules for host ${host} conflict or are incomplete.`,
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
      rec: reviewIngress(docs, host, "Could not locate http.paths for this host in the raw object → Review."),
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
      rec: reviewIngress(docs, host, "Failed to serialize merged candidate; no YAML."),
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
      rationale: `Merge ${docs.length} Ingress resources for host "${host}" into one (${mergedName}).`,
      estimatedLineDelta: Math.max(0, lineApprox),
      warnings: [
        "Verify annotations / finalizers / dependencies in-cluster before apply.",
        "Candidate name uses -merged-candidate to avoid collisions.",
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
    warnings: ["Merge or split manually, then re-import to verify."],
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
        rationale: "VirtualService across namespaces is out of v1 scope.",
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
        rationale: "hosts or gateways sets differ; cannot merge under v1.",
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
            rationale: `http route has fields not fully modeled in v1: ${hit.join(", ")} → no candidate YAML.`,
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
          rationale: `spec contains fields outside v1: ${bad.join(", ")}; suggestions only.`,
          estimatedLineDelta: 0,
          warnings: ["Manually merge if you must keep mirror/timeout/retries, etc."],
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
        rationale: "Failed to serialize VirtualService candidate.",
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
      rationale: `Merge ${docs.length} VirtualService resources (same hosts/gateways) into ${mergedName}.`,
      estimatedLineDelta: Math.max(0, lineApprox),
      warnings: [
        "Deduped by match+route; if you rely on http ordering or fault/retries not modeled here, review manually.",
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
          ? "Parse warnings present; no merge candidates. Fix YAML and retry."
          : "No duplicate Ingress host groups or VirtualService groups within v1 safe bounds.",
      estimatedLineDelta: 0,
      warnings: [],
    });
  }

  return { recommendations, v1RulesReminder: V1_REMINDER };
}
