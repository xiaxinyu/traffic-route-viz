import { parseAllDocuments } from "yaml";

export type K8sDoc = Record<string, unknown>;

function asRecord(v: unknown): K8sDoc | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as K8sDoc)
    : null;
}

function getMeta(doc: K8sDoc): { name?: string; namespace?: string } {
  const m = asRecord(doc.metadata);
  return {
    name: typeof m?.name === "string" ? m.name : undefined,
    namespace: typeof m?.namespace === "string" ? m.namespace : undefined,
  };
}

/** One `spec.tls[]` entry on Ingress. */
export interface IngressTlsEntry {
  hosts: string[];
  secretName?: string;
}

export interface IngressRoute {
  ingressNs?: string;
  ingressName: string;
  host: string;
  path: string;
  pathType?: string;
  serviceName: string;
  servicePort: number | string;
  /** Namespace where the Service is expected (Ingress namespace if not cross-ns in spec). */
  serviceNamespace?: string;
  /** TLS secret for this host from `spec.tls`, if matched. */
  tlsSecretName?: string;
  /** Source file name (if parsed per-file). */
  sourceFile?: string;
}

export interface ServiceInfo {
  key: string;
  name: string;
  namespace?: string;
  type?: string;
  clusterIP?: string;
  ports: { port: number; targetPort?: number | string; protocol?: string }[];
  sourceFiles?: string[];
}

export interface EndpointsInfo {
  key: string;
  name: string;
  namespace?: string;
  addresses: string[];
  ports: { port: number; protocol?: string }[];
  sourceFiles?: string[];
}

export interface IngressSummary {
  name: string;
  namespace?: string;
  className?: string;
  /** Raw TLS blocks from `spec.tls`. */
  tls: IngressTlsEntry[];
  /** VIP / LB IPs from `status.loadBalancer.ingress`. */
  loadBalancerIps: string[];
  /** Which imported files this ingress came from. */
  sourceFiles: string[];
}

export interface ParseResult {
  ingresses: IngressSummary[];
  routes: IngressRoute[];
  services: ServiceInfo[];
  endpoints: EndpointsInfo[];
  errors: string[];
}

function resourceKey(ns: string | undefined, name: string): string {
  return ns ? `${ns}/${name}` : name;
}

function parseIngressTls(spec: Record<string, unknown> | null): IngressTlsEntry[] {
  if (!spec) return [];
  const raw = spec.tls;
  if (!Array.isArray(raw)) return [];
  const out: IngressTlsEntry[] = [];
  for (const item of raw) {
    const t = asRecord(item);
    if (!t) continue;
    const hosts = Array.isArray(t.hosts)
      ? t.hosts.filter((h): h is string => typeof h === "string")
      : [];
    const secretName =
      typeof t.secretName === "string" ? t.secretName : undefined;
    out.push({ hosts, secretName });
  }
  return out;
}

function hostToTlsSecret(tlsBlocks: IngressTlsEntry[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const block of tlsBlocks) {
    for (const h of block.hosts) {
      if (block.secretName) m.set(h, block.secretName);
    }
  }
  return m;
}

function parseIngressLbIps(status: unknown): string[] {
  const s = asRecord(status);
  const lb = asRecord(s?.loadBalancer);
  const items = Array.isArray(lb?.ingress) ? lb.ingress : [];
  const ips: string[] = [];
  for (const it of items) {
    const o = asRecord(it);
    if (typeof o?.ip === "string") ips.push(o.ip);
    if (typeof o?.hostname === "string") ips.push(o.hostname);
  }
  return ips;
}

function tlsKey(t: IngressTlsEntry): string {
  return `${t.secretName ?? ""}|${t.hosts.join(",")}`;
}

function mergeIngressSummary(
  a: IngressSummary | undefined,
  b: IngressSummary,
): IngressSummary {
  if (!a) return b;
  const tlsSeen = new Set(a.tls.map(tlsKey));
  const tls = [...a.tls];
  for (const t of b.tls) {
    if (!tlsSeen.has(tlsKey(t))) {
      tlsSeen.add(tlsKey(t));
      tls.push(t);
    }
  }
  const lb = [...new Set([...a.loadBalancerIps, ...b.loadBalancerIps])];
  const sourceFiles = [...new Set([...(a.sourceFiles ?? []), ...(b.sourceFiles ?? [])])];
  return {
    name: a.name,
    namespace: a.namespace ?? b.namespace,
    className: a.className ?? b.className,
    tls,
    loadBalancerIps: lb,
    sourceFiles,
  };
}

export function parseK8sYaml(text: string, sourceFile?: string): ParseResult {
  const errors: string[] = [];
  const ingressByKey = new Map<string, IngressSummary>();
  const routes: IngressRoute[] = [];
  const services = new Map<string, ServiceInfo>();
  const endpoints = new Map<string, EndpointsInfo>();

  let docs: unknown[];
  try {
    docs = parseAllDocuments(text).map((d) => {
      if (d.errors.length) {
        d.errors.forEach((e) => errors.push(e.message));
      }
      return d.toJS();
    });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return {
      ingresses: [],
      routes: [],
      services: [],
      endpoints: [],
      errors,
    };
  }

  for (const doc of docs) {
    const o = asRecord(doc);
    if (!o) continue;
    const kind = o.kind;
    const api = o.apiVersion;
    if (!kind || typeof kind !== "string") continue;

    if (kind === "Ingress") {
      const meta = getMeta(o);
      const ingressName = meta.name ?? "(unnamed)";
      const ingressNs = meta.namespace;
      const spec = asRecord(o.spec);
      const className =
        typeof spec?.ingressClassName === "string"
          ? spec.ingressClassName
          : undefined;
      const tlsBlocks = parseIngressTls(spec);
      const loadBalancerIps = parseIngressLbIps(o.status);
      const ikey = resourceKey(ingressNs, ingressName);
      const incoming: IngressSummary = {
        name: ingressName,
        namespace: ingressNs,
        className,
        tls: tlsBlocks,
        loadBalancerIps,
        sourceFiles: sourceFile ? [sourceFile] : [],
      };
      ingressByKey.set(
        ikey,
        mergeIngressSummary(ingressByKey.get(ikey), incoming),
      );

      const tlsByHost = hostToTlsSecret(tlsBlocks);

      const rules = Array.isArray(spec?.rules) ? spec.rules : [];
      for (const rule of rules) {
        const r = asRecord(rule);
        const host = typeof r?.host === "string" ? r.host : "*";
        const http = asRecord(r?.http);
        const paths = Array.isArray(http?.paths) ? http.paths : [];
        for (const p of paths) {
          const pathObj = asRecord(p);
          const backend = asRecord(pathObj?.backend);
          const svc = asRecord(backend?.service);
          const portObj = asRecord(svc?.port);
          const serviceName =
            typeof svc?.name === "string" ? svc.name : "?";
          let servicePort: number | string =
            typeof portObj?.number === "number"
              ? portObj.number
              : typeof portObj?.name === "string"
                ? portObj.name
                : "?";
          const path =
            typeof pathObj?.path === "string" ? pathObj.path : "/";
          const pathType =
            typeof pathObj?.pathType === "string"
              ? pathObj.pathType
              : undefined;
          const tlsSecretName = tlsByHost.get(host);
          routes.push({
            ingressNs,
            ingressName,
            host,
            path,
            pathType,
            serviceName,
            servicePort,
            serviceNamespace: ingressNs,
            tlsSecretName,
            sourceFile,
          });
        }
      }
      continue;
    }

    if (kind === "Service" && api === "v1") {
      const meta = getMeta(o);
      const name = meta.name ?? "?";
      const ns = meta.namespace;
      const key = resourceKey(ns, name);
      const spec = asRecord(o.spec);
      const type = typeof spec?.type === "string" ? spec.type : undefined;
      const clusterIP =
        typeof spec?.clusterIP === "string" ? spec.clusterIP : undefined;
      const portList = Array.isArray(spec?.ports) ? spec.ports : [];
      const ports = portList.map((pp) => {
        const pr = asRecord(pp);
        return {
          port: typeof pr?.port === "number" ? pr.port : 0,
          targetPort: pr?.targetPort as number | string | undefined,
          protocol:
            typeof pr?.protocol === "string" ? pr.protocol : undefined,
        };
      });
      services.set(key, {
        key,
        name,
        namespace: ns,
        type,
        clusterIP,
        ports,
        sourceFiles: sourceFile ? [sourceFile] : [],
      });
      continue;
    }

    if (kind === "Endpoints" && api === "v1") {
      const meta = getMeta(o);
      const name = meta.name ?? "?";
      const ns = meta.namespace;
      const key = resourceKey(ns, name);
      const subsets = Array.isArray(o.subsets) ? o.subsets : [];
      const addresses: string[] = [];
      const epPorts: { port: number; protocol?: string }[] = [];
      for (const sub of subsets) {
        const s = asRecord(sub);
        const addrs = Array.isArray(s?.addresses) ? s.addresses : [];
        for (const a of addrs) {
          const ar = asRecord(a);
          if (typeof ar?.ip === "string") addresses.push(ar.ip);
        }
        const plist = Array.isArray(s?.ports) ? s.ports : [];
        for (const po of plist) {
          const por = asRecord(po);
          epPorts.push({
            port: typeof por?.port === "number" ? por.port : 0,
            protocol:
              typeof por?.protocol === "string" ? por.protocol : undefined,
          });
        }
      }
      endpoints.set(key, {
        key,
        name,
        namespace: ns,
        addresses,
        ports: epPorts,
        sourceFiles: sourceFile ? [sourceFile] : [],
      });
    }
  }

  return {
    ingresses: [...ingressByKey.values()],
    routes,
    services: [...services.values()],
    endpoints: [...endpoints.values()],
    errors,
  };
}
