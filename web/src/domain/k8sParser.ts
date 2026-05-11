import { parseAllDocuments } from "yaml";

export type K8sDoc = Record<string, unknown>;

function asRecord(v: unknown): K8sDoc | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as K8sDoc) : null;
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

/** One Istio HTTP/TLS/TCP route destination (VirtualService `route[].destination` + `route[].weight`). */
export interface IstioRouteDestination {
  host: string;
  subset?: string;
  weight?: number;
  port?: number | string;
}

export interface IngressRoute {
  /** Origin kind: Ingress / Istio VirtualService / Contour HTTPProxy. */
  ingressKind?: "Ingress" | "VirtualService" | "HTTPProxy";
  ingressNs?: string;
  ingressName: string;
  /** Istio only: gateways referenced by VirtualService spec.gateways */
  gateways?: string[];
  host: string;
  path: string;
  pathType?: string;
  serviceName: string;
  servicePort: number | string;
  /** For Contour gateway: which gateway Service this route is attached to. */
  gatewayServiceName?: string;
  /** For gateway-style configs: preserve original backend service (if we normalize serviceName). */
  upstreamServiceName?: string;
  upstreamServicePort?: number | string;
  /** Namespace where the Service is expected (Ingress namespace if not cross-ns in spec). */
  serviceNamespace?: string;
  /** TLS secret for this host from `spec.tls`, if matched. */
  tlsSecretName?: string;
  /** Source file name (if parsed per-file). */
  sourceFile?: string;
  /** Istio VirtualService: all weighted destinations for this match (subset / weight). */
  istioDestinations?: IstioRouteDestination[];
  /** Istio VirtualService: http route name (spec.http[].name). */
  istioRouteName?: string;
  /** Istio VirtualService: match-level query params (match.queryParams). */
  istioQueryParams?: {
    key: string;
    op: "exact" | "prefix" | "regex" | "present";
    value?: string;
  }[];
  /** Istio VirtualService: request headers set (match.headers.request.set). */
  istioRequestHeadersSet?: Record<string, string>;
}

export interface ServiceInfo {
  key: string;
  name: string;
  namespace?: string;
  type?: string;
  clusterIP?: string;
  ports: { port: number; targetPort?: number | string; protocol?: string }[];
  /** Istio DestinationRule subsets for this host/service (if present). */
  istioSubsets?: string[];
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
  kind: "Ingress" | "VirtualService" | "HTTPProxy";
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
  gateways: IstioGatewayInfo[];
  destinationRules: DestinationRuleInfo[];
  errors: string[];
}

export interface IstioGatewayInfo {
  key: string; // ns/name
  name: string;
  namespace?: string;
  selector?: Record<string, string>;
  servers: { port?: number; name?: string; protocol?: string; hosts: string[] }[];
  sourceFiles?: string[];
}

export interface DestinationRuleInfo {
  /** Unique DestinationRule resource key `namespace/name`. */
  key: string;
  /** Service key (ns/name) resolved from `spec.host`. */
  serviceKey: string;
  name: string;
  namespace?: string;
  host?: string;
  subsets: string[];
  sourceFiles?: string[];
}

function resourceKey(ns: string | undefined, name: string): string {
  return ns ? `${ns}/${name}` : name;
}

function extractIstioRouteDestinations(routeArr: unknown[]): IstioRouteDestination[] {
  const out: IstioRouteDestination[] = [];
  const parseMaybeNumber = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return undefined;
      // Accept formats like "80", "80.5", "80%" (some YAML exports include %).
      const cleaned = s.endsWith("%") ? s.slice(0, -1).trim() : s;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };
  for (const item of routeArr) {
    const r = asRecord(item);
    const dest = asRecord(r?.destination);
    const host = typeof dest?.host === "string" ? dest.host : "?";
    const subset = typeof dest?.subset === "string" ? dest.subset : undefined;
    const weight = parseMaybeNumber(r?.weight);
    const destPortObj = asRecord(dest?.port);
    let port: number | string = "?";
    const pn = parseMaybeNumber(destPortObj?.number);
    if (typeof pn === "number") port = pn;
    else if (typeof destPortObj?.name === "string") port = destPortObj.name;
    out.push({ host, subset, weight, port });
  }
  return out;
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
    const secretName = typeof t.secretName === "string" ? t.secretName : undefined;
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

function mergeIngressSummary(a: IngressSummary | undefined, b: IngressSummary): IngressSummary {
  if (!a) return b;
  // Kind should be stable for the same key (we key by kind+ns+name).
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
    kind: a.kind,
    name: a.name,
    namespace: a.namespace ?? b.namespace,
    className: a.className ?? b.className,
    tls,
    loadBalancerIps: lb,
    sourceFiles,
  };
}

export function parseIstioHostToServiceKey(
  rawHost: string,
  fallbackNs: string | undefined,
): { name: string; namespace: string | undefined } {
  // Examples:
  // - reviews
  // - reviews.default
  // - reviews.default.svc.cluster.local
  const parts = rawHost.split(".").filter(Boolean);
  const name = parts[0] ?? rawHost;
  const namespace = parts.length >= 2 ? parts[1] : fallbackNs;
  return { name, namespace };
}

function asStringMap(v: K8sDoc | null): Record<string, string> | null {
  if (!v) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return Object.keys(out).length ? out : null;
}

function baseNameNoExt(pathLike: string): string {
  const file = pathLike.split(/[/\\]/).pop() ?? pathLike;
  return file.replace(/\.(ya?ml)$/i, "");
}

export function parseK8sYaml(text: string, sourceFile?: string): ParseResult {
  const errors: string[] = [];
  const ingressByKey = new Map<string, IngressSummary>();
  const routes: IngressRoute[] = [];
  const services = new Map<string, ServiceInfo>();
  const endpoints = new Map<string, EndpointsInfo>();
  // DestinationRule host -> subsets
  const istioSubsetsByKey = new Map<string, string[]>();
  const destinationRules: DestinationRuleInfo[] = [];
  const gatewayByKey = new Map<string, IstioGatewayInfo>();

  let docs: unknown[];
  try {
    docs = parseAllDocuments(text).map((d) => {
      if (d.errors.length) {
        d.errors.forEach((e) => {
          errors.push(e.message);
        });
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
      gateways: [],
      destinationRules: [],
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
        typeof spec?.ingressClassName === "string" ? spec.ingressClassName : undefined;
      const tlsBlocks = parseIngressTls(spec);
      const loadBalancerIps = parseIngressLbIps(o.status);
      const ikey = `Ingress:${resourceKey(ingressNs, ingressName)}`;
      const incoming: IngressSummary = {
        kind: "Ingress",
        name: ingressName,
        namespace: ingressNs,
        className,
        tls: tlsBlocks,
        loadBalancerIps,
        sourceFiles: sourceFile ? [sourceFile] : [],
      };
      ingressByKey.set(ikey, mergeIngressSummary(ingressByKey.get(ikey), incoming));

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
          const serviceName = typeof svc?.name === "string" ? svc.name : "?";
          const servicePort: number | string =
            typeof portObj?.number === "number"
              ? portObj.number
              : typeof portObj?.name === "string"
                ? portObj.name
                : "?";
          const path = typeof pathObj?.path === "string" ? pathObj.path : "/";
          const pathType = typeof pathObj?.pathType === "string" ? pathObj.pathType : undefined;
          const tlsSecretName = tlsByHost.get(host);
          routes.push({
            ingressKind: "Ingress",
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

    // Contour HTTPProxy (minimal modeling as "Ingress-like" entry)
    if (kind === "HTTPProxy" && typeof api === "string" && api.startsWith("projectcontour.io/")) {
      const meta = getMeta(o);
      const proxyName = meta.name ?? "(unnamed)";
      const proxyNs = meta.namespace;
      const spec = asRecord(o.spec);
      const className =
        typeof spec?.ingressClassName === "string" ? spec.ingressClassName : undefined;

      // Host from metadata annotations (observed in your rbac-gateway.yaml)
      const metadataObj = asRecord(o.metadata);
      const annotations = asRecord(metadataObj?.annotations);
      const fqdnKey = "app.projectsesame.io/fqdn";
      const hostFromAnn =
        typeof (annotations as Record<string, unknown> | undefined)?.[fqdnKey] === "string"
          ? ((annotations as Record<string, unknown>)[fqdnKey] as string)
          : undefined;
      const host = hostFromAnn ?? "*";

      // Per requirement: when the user wraps contour gateway routes into a single file,
      // that file name is the "source node name" AND also the gateway Service name.
      // So we group all HTTPProxy docs from the same sourceFile into ONE entry.
      const gatewayServiceName = sourceFile ? baseNameNoExt(sourceFile) : proxyName;
      const ikey = `HTTPProxy:${resourceKey(proxyNs, gatewayServiceName)}`;
      const incoming: IngressSummary = {
        kind: "HTTPProxy",
        name: gatewayServiceName,
        namespace: proxyNs,
        className,
        tls: [],
        loadBalancerIps: [],
        sourceFiles: sourceFile ? [sourceFile] : [],
      };
      ingressByKey.set(ikey, mergeIngressSummary(ingressByKey.get(ikey), incoming));

      const routesArr = Array.isArray(spec?.routes) ? spec!.routes! : [];
      for (const r of routesArr) {
        const rr = asRecord(r);
        const conditionsArr = Array.isArray(rr?.conditions) ? rr!.conditions! : [];
        const prefixes: string[] = [];
        for (const c of conditionsArr) {
          const cc = asRecord(c);
          if (typeof cc?.prefix === "string" && cc.prefix) {
            prefixes.push(cc.prefix);
          }
        }
        if (!prefixes.length) prefixes.push("*");

        const servicesArr = Array.isArray(rr?.services) ? rr!.services! : [];
        for (const svc of servicesArr) {
          const ss = asRecord(svc);
          const svcName = typeof ss?.name === "string" ? ss!.name : "?";
          const portRaw = (ss as unknown as Record<string, unknown> | undefined)?.port;
          let svcPort: number | string = "?";
          if (typeof portRaw === "number") svcPort = portRaw;
          else if (typeof portRaw === "string") svcPort = portRaw;
          else if (asRecord(portRaw)) {
            const pr = asRecord(portRaw as unknown);
            const portObj = pr as Record<string, unknown>;
            if (typeof portObj.number === "number") svcPort = portObj.number;
            else if (typeof portObj.name === "string") svcPort = portObj.name;
          }

          for (const p of prefixes) {
            // Principle: HTTPProxy is a gateway route config:
            // Ingress -> Service(gateway) -> Contour Gateway -> HTTPProxy -> Service(upstream)
            // So on each route we keep the upstream service as serviceName,
            // and also record which gateway service this HTTPProxy belongs to.
            const normalizedServiceName = svcName;
            const normalizedPort: number | string = svcPort;
            routes.push({
              ingressKind: "HTTPProxy",
              ingressNs: proxyNs,
              ingressName: gatewayServiceName,
              host,
              path: p === "*" ? "/" : p,
              pathType: "Prefix",
              serviceName: normalizedServiceName,
              servicePort: normalizedPort,
              gatewayServiceName,
              upstreamServiceName: svcName,
              upstreamServicePort: svcPort,
              serviceNamespace: proxyNs,
              tlsSecretName: undefined,
              sourceFile,
            });
          }
        }
      }

      continue;
    }

    // Istio VirtualService (minimal modeling as "Ingress-like" entry)
    if (
      kind === "VirtualService" &&
      typeof api === "string" &&
      api.startsWith("networking.istio.io/")
    ) {
      const meta = getMeta(o);
      const vsName = meta.name ?? "(unnamed)";
      const vsNs = meta.namespace;
      const spec = asRecord(o.spec);
      const hosts = Array.isArray(spec?.hosts)
        ? spec!.hosts!.filter((h): h is string => typeof h === "string")
        : ["*"];
      const gateways = Array.isArray(spec?.gateways)
        ? spec!.gateways!.filter((g): g is string => typeof g === "string")
        : [];

      const ikey = `VirtualService:${resourceKey(vsNs, vsName)}`;
      const incoming: IngressSummary = {
        kind: "VirtualService",
        name: vsName,
        namespace: vsNs,
        className: "istio",
        tls: [],
        loadBalancerIps: [],
        sourceFiles: sourceFile ? [sourceFile] : [],
      };
      ingressByKey.set(ikey, mergeIngressSummary(ingressByKey.get(ikey), incoming));

      const http = Array.isArray(spec?.http) ? spec!.http! : [];
      for (const httpRule of http) {
        const hr = asRecord(httpRule);
        const httpName = typeof hr?.name === "string" ? hr.name : undefined;
        const hrHeaders = asRecord(hr?.headers);
        const hrReq = asRecord(hrHeaders?.request);
        const hrSetObj = asRecord(hrReq?.set);
        const hrRequestHeadersSet: Record<string, string> | undefined = hrSetObj
          ? Object.fromEntries(
              Object.entries(hrSetObj)
                .filter(([, v]) => typeof v === "string")
                .map(([k, v]) => [k, v as string]),
            )
          : undefined;
        const matches = Array.isArray(hr?.match) ? (hr!.match! as unknown[]) : [];
        const routesArr = Array.isArray(hr?.route) ? (hr!.route! as unknown[]) : [];
        const istioDestinations = extractIstioRouteDestinations(routesArr);
        const firstRoute = routesArr.length ? asRecord(routesArr[0]) : null;
        const dest = asRecord(firstRoute?.destination);
        const destHost =
          typeof dest?.host === "string" ? dest.host : (istioDestinations[0]?.host ?? "?");
        const destPortObj = asRecord(dest?.port);
        const servicePort: number | string =
          typeof destPortObj?.number === "number"
            ? destPortObj.number
            : typeof destPortObj?.name === "string"
              ? destPortObj.name
              : istioDestinations[0]?.port !== undefined
                ? istioDestinations[0]!.port
                : "?";
        const { name: svcName, namespace: svcNs } = parseIstioHostToServiceKey(destHost, vsNs);

        const matchList = matches.length ? matches : [null];
        for (const m of matchList) {
          const mr = asRecord(m);
          const uri = asRecord(mr?.uri);
          const matchPaths: { path: string; pathType?: string }[] = [];
          if (uri) {
            if (typeof uri.prefix === "string")
              matchPaths.push({ path: uri.prefix, pathType: "Prefix" });
            else if (typeof uri.exact === "string")
              matchPaths.push({ path: uri.exact, pathType: "Exact" });
            else if (typeof uri.regex === "string")
              matchPaths.push({ path: uri.regex, pathType: "Regex" });
          }
          if (!matchPaths.length) matchPaths.push({ path: "*", pathType: undefined });

          const queryParamsRaw = asRecord(mr?.queryParams);
          const queryParams: {
            key: string;
            op: "exact" | "prefix" | "regex" | "present";
            value?: string;
          }[] = [];
          if (queryParamsRaw) {
            for (const [k, v] of Object.entries(queryParamsRaw)) {
              const q = asRecord(v);
              if (!q) continue;
              if (typeof q.exact === "string")
                queryParams.push({ key: k, op: "exact", value: q.exact });
              else if (typeof q.prefix === "string")
                queryParams.push({ key: k, op: "prefix", value: q.prefix });
              else if (typeof q.regex === "string")
                queryParams.push({ key: k, op: "regex", value: q.regex });
              else if (typeof q.present === "boolean") queryParams.push({ key: k, op: "present" });
            }
          }
          queryParams.sort(
            (a, b) =>
              a.key.localeCompare(b.key) ||
              a.op.localeCompare(b.op) ||
              (a.value ?? "").localeCompare(b.value ?? ""),
          );

          const headers = asRecord(mr?.headers);
          const req = asRecord(headers?.request);
          const setObj = asRecord(req?.set);
          const matchRequestHeadersSet: Record<string, string> | undefined = setObj
            ? Object.fromEntries(
                Object.entries(setObj)
                  .filter(([, v]) => typeof v === "string")
                  .map(([k, v]) => [k, v as string]),
              )
            : undefined;
          const requestHeadersSet =
            hrRequestHeadersSet || matchRequestHeadersSet
              ? { ...(hrRequestHeadersSet ?? {}), ...(matchRequestHeadersSet ?? {}) }
              : undefined;

          for (const h of hosts) {
            for (const mp of matchPaths) {
              routes.push({
                ingressKind: "VirtualService",
                ingressNs: vsNs,
                ingressName: vsName,
                gateways,
                host: h,
                path: mp.path,
                pathType: mp.pathType,
                serviceName: svcName,
                servicePort,
                serviceNamespace: svcNs,
                sourceFile,
                istioDestinations: istioDestinations.length > 0 ? istioDestinations : undefined,
                istioRouteName: httpName,
                istioQueryParams: queryParams.length ? queryParams : undefined,
                istioRequestHeadersSet:
                  requestHeadersSet && Object.keys(requestHeadersSet).length
                    ? requestHeadersSet
                    : undefined,
              });
            }
          }
        }
      }
      continue;
    }

    // Istio DestinationRule: attach subsets to Service by host key
    if (
      kind === "DestinationRule" &&
      typeof api === "string" &&
      api.startsWith("networking.istio.io/")
    ) {
      const meta = getMeta(o);
      const drNs = meta.namespace;
      const drName = meta.name ?? "(unnamed)";
      const spec = asRecord(o.spec);
      const host = typeof spec?.host === "string" ? spec.host : undefined;
      if (host) {
        const { name, namespace } = parseIstioHostToServiceKey(host, drNs);
        const serviceKey = resourceKey(namespace, name);
        const drKey = resourceKey(drNs, drName);
        const subsetsRaw = Array.isArray(spec?.subsets) ? spec!.subsets! : [];
        const subsetNames = subsetsRaw
          .map((s) => asRecord(s))
          .filter(Boolean)
          .map((s) => (typeof s!.name === "string" ? s!.name : null))
          .filter((x): x is string => !!x);
        if (subsetNames.length) {
          const prev = istioSubsetsByKey.get(serviceKey) ?? [];
          istioSubsetsByKey.set(serviceKey, [...new Set([...prev, ...subsetNames])]);
        }
        destinationRules.push({
          key: drKey,
          serviceKey,
          name: drName,
          namespace: drNs,
          host,
          subsets: subsetNames,
          sourceFiles: sourceFile ? [sourceFile] : [],
        });
      }
      continue;
    }

    // Istio Gateway: render as an explicit node and link into VirtualService when referenced.
    if (kind === "Gateway" && typeof api === "string" && api.startsWith("networking.istio.io/")) {
      const meta = getMeta(o);
      const gwName = meta.name ?? "(unnamed)";
      const gwNs = meta.namespace;
      const key = resourceKey(gwNs, gwName);
      const spec = asRecord(o.spec);
      const selector = asStringMap(asRecord(spec?.selector)) ?? undefined;
      const serversRaw = Array.isArray(spec?.servers) ? spec!.servers! : [];
      const servers = serversRaw
        .map((s) => asRecord(s))
        .filter(Boolean)
        .map((s) => {
          const portObj = asRecord(s!.port);
          const hostsRaw = Array.isArray(s!.hosts) ? (s!.hosts as unknown[]) : [];
          return {
            port: typeof portObj?.number === "number" ? portObj.number : undefined,
            name: typeof portObj?.name === "string" ? portObj.name : undefined,
            protocol: typeof portObj?.protocol === "string" ? portObj.protocol : undefined,
            hosts: hostsRaw.filter((h): h is string => typeof h === "string"),
          };
        });
      gatewayByKey.set(key, {
        key,
        name: gwName,
        namespace: gwNs,
        selector,
        servers,
        sourceFiles: sourceFile ? [sourceFile] : [],
      });
      continue;
    }

    if (kind === "Service" && api === "v1") {
      const meta = getMeta(o);
      const name = meta.name ?? "?";
      const ns = meta.namespace;
      const key = resourceKey(ns, name);
      const spec = asRecord(o.spec);
      const type = typeof spec?.type === "string" ? spec.type : undefined;
      const clusterIP = typeof spec?.clusterIP === "string" ? spec.clusterIP : undefined;
      const portList = Array.isArray(spec?.ports) ? spec.ports : [];
      const ports = portList.map((pp) => {
        const pr = asRecord(pp);
        return {
          port: typeof pr?.port === "number" ? pr.port : 0,
          targetPort: pr?.targetPort as number | string | undefined,
          protocol: typeof pr?.protocol === "string" ? pr.protocol : undefined,
        };
      });
      services.set(key, {
        key,
        name,
        namespace: ns,
        type,
        clusterIP,
        ports,
        istioSubsets: istioSubsetsByKey.get(key),
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
            protocol: typeof por?.protocol === "string" ? por.protocol : undefined,
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

  // Attach Istio subsets to Services in a post-pass (DestinationRule may appear after Service).
  for (const [k, svc] of services.entries()) {
    const subs = istioSubsetsByKey.get(k);
    if (subs?.length) services.set(k, { ...svc, istioSubsets: subs });
  }

  return {
    ingresses: [...ingressByKey.values()],
    routes,
    services: [...services.values()],
    endpoints: [...endpoints.values()],
    gateways: [...gatewayByKey.values()],
    destinationRules,
    errors,
  };
}
