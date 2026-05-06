import type { Edge, Node } from "reactflow";
import type { ParseResult } from "./k8sParser";

function resourceKey(ns: string | undefined, name: string): string {
  return ns ? `${ns}/${name}` : name;
}

export function buildFlowGraph(parsed: ParseResult): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const col = 300;
  // Bigger spacing for readability (Host/Service stacks).
  const hostGap = 170;
  const routeGap = 64;
  const serviceGap = 150;
  const topY = 40;
  const baseX = 40;
  const ingressBlockW = col * 4;
  const sanitizeId = (v: string) => v.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const edgeType: Edge["type"] = "smoothstep";

  const serviceByKey = new Map<string, (typeof parsed.services)[0]>();
  for (const s of parsed.services) {
    serviceByKey.set(s.key, s);
  }
  const epByKey = new Map<string, (typeof parsed.endpoints)[0]>();
  for (const e of parsed.endpoints) {
    epByKey.set(e.key, e);
  }

  const ingId = (ns: string | undefined, name: string) =>
    `ing-${resourceKey(ns, name).replace(/[^a-zA-Z0-9/_-]/g, "_")}`;

  // ---- Layout: partition by ingress, then by host, then by route list ----
  const ingressIndexById = new Map<string, number>();
  parsed.ingresses.forEach((ing, idx) => {
    ingressIndexById.set(ingId(ing.namespace, ing.name), idx);
  });

  // Group routes by ingress -> host
  const routesByIngress = new Map<string, typeof parsed.routes>();
  for (const r of parsed.routes) {
    const iid = ingId(r.ingressNs, r.ingressName);
    const list = routesByIngress.get(iid) ?? [];
    list.push(r);
    routesByIngress.set(iid, list);
  }

  const median = (nums: number[]): number => {
    if (!nums.length) return topY;
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
  };

  let edgeIdx = 0;
  for (const ing of parsed.ingresses) {
    const iid = ingId(ing.namespace, ing.name);
    const blockIdx = ingressIndexById.get(iid) ?? 0;
    const blockX = baseX + blockIdx * ingressBlockW;

    // Ingress node
    nodes.push({
      id: iid,
      type: "ingress",
      position: { x: blockX, y: topY },
      data: {
        label: ing.name,
        subtitle: ing.namespace ? `namespace: ${ing.namespace}` : undefined,
        className: ing.className,
        tls: ing.tls,
        loadBalancerIps: ing.loadBalancerIps,
      },
    });

    const files =
      ing.sourceFiles && ing.sourceFiles.length
        ? `文件: ${ing.sourceFiles.join(", ")}`
        : "文件: （未标注来源）";

    const ingressRoutes = routesByIngress.get(iid) ?? [];
    // Order hosts by name for stability
    const hosts = [...new Set(ingressRoutes.map((r) => r.host))].sort((a, b) =>
      a.localeCompare(b),
    );

    // Decorative region (height computed after we place nodes)
    const regionId = `region-${sanitizeId(iid)}`;
    nodes.push({
      id: regionId,
      type: "group",
      position: { x: blockX - 24, y: 20 },
      data: { label: `Ingress 区域: ${ing.name}\n${files}` },
      style: {
        width: ingressBlockW - 24,
        height: 760,
        background: "rgba(79,70,229,0.06)",
        border: "1px solid rgba(79,70,229,0.18)",
        borderRadius: 16,
      },
      selectable: false,
      draggable: false,
    });

    const hostIdByHost = new Map<string, string>();
    const routeYsByService = new Map<string, number[]>();
    const serviceIdByKey = new Map<string, string>();
    const endpointIdByKey = new Map<string, string>();

    let maxY = topY + 200;

    // 1) Place hosts + routes (a clean vertical list per host)
    hosts.forEach((host, hostIdx) => {
      const hid = `host-${sanitizeId(iid)}-${sanitizeId(host)}-${hostIdx}`;
      hostIdByHost.set(host, hid);

      const hostY = topY + 40 + hostIdx * hostGap;
      maxY = Math.max(maxY, hostY);

      // Pick a representative TLS secret for the host (if multiple, first non-empty)
      const tlsSecretName =
        ingressRoutes.find((r) => r.host === host && r.tlsSecretName)?.tlsSecretName ??
        undefined;

      nodes.push({
        id: hid,
        type: "host",
        position: { x: blockX + col, y: hostY },
        data: { label: host, tlsSecretName, ingressName: ing.name },
      });

      edges.push({
        id: `e-${iid}-${hid}-${edgeIdx++}`,
        source: iid,
        target: hid,
        type: edgeType,
        animated: true,
      });

      const hostRoutes = ingressRoutes
        .filter((r) => r.host === host)
        .sort((a, b) => a.path.localeCompare(b.path));

      hostRoutes.forEach((r, routeIdx) => {
        const routeY = hostY + 36 + routeIdx * routeGap;
        maxY = Math.max(maxY, routeY);
        const routeId = `route-${sanitizeId(iid)}-${sanitizeId(host)}-${sanitizeId(
          `${r.path}-${String(r.servicePort)}-${r.serviceName}`,
        )}-${routeIdx}`;

        nodes.push({
          id: routeId,
          type: "route",
          position: { x: blockX + col * 1.55, y: routeY },
          data: {
            path: r.path,
            pathType: r.pathType,
            serviceName: r.serviceName,
            servicePort: r.servicePort,
          },
        });

        edges.push({
          id: `e-${hid}-${routeId}-${edgeIdx++}`,
          source: hid,
          target: routeId,
          type: edgeType,
          style: { stroke: "#7c3aed" },
        });

        const svcNs = r.serviceNamespace ?? r.ingressNs;
        const skey = resourceKey(svcNs, r.serviceName);
        const svcScoped = `${iid}::${skey}`;
        const list = routeYsByService.get(svcScoped) ?? [];
        list.push(routeY);
        routeYsByService.set(svcScoped, list);

        // Create service id mapping (node created later with computed y)
        if (!serviceIdByKey.has(svcScoped)) {
          serviceIdByKey.set(svcScoped, `svc-${sanitizeId(svcScoped)}`);
        }

        edges.push({
          id: `e-${routeId}-${serviceIdByKey.get(svcScoped)!}-${edgeIdx++}`,
          source: routeId,
          target: serviceIdByKey.get(svcScoped)!,
          type: edgeType,
          label: `→ :${String(r.servicePort)}`,
          style: { stroke: "#6366f1" },
          labelStyle: { fontSize: 11, fill: "#334155", fontWeight: 500 },
          labelBgStyle: { fill: "#e0e7ff", fillOpacity: 0.95 },
        });
      });
    });

    // 2) Place service nodes near median of their routes, then collision-resolve
    const serviceEntries = [...serviceIdByKey.entries()].map(([svcScoped, sid]) => {
      const [, skey] = svcScoped.split("::");
      const [ns, name] = skey.includes("/") ? skey.split("/", 2) : [undefined, skey];
      const desiredY = median(routeYsByService.get(svcScoped) ?? []);
      return { svcScoped, sid, skey, ns, name, desiredY };
    });
    serviceEntries.sort((a, b) => a.desiredY - b.desiredY);
    let lastY = -Infinity;
    for (const s of serviceEntries) {
      const svcY = Math.max(s.desiredY, lastY + serviceGap);
      lastY = svcY;
      maxY = Math.max(maxY, svcY);

      const si = serviceByKey.get(s.skey);
      nodes.push({
        id: s.sid,
        type: "service",
        position: { x: blockX + col * 2.35, y: svcY },
        data: {
          label: s.name,
          subtitle: s.ns ? `namespace: ${s.ns}` : undefined,
          type: si?.type,
          clusterIP: si?.clusterIP,
          ports: si?.ports,
        },
      });

      const ep = epByKey.get(s.skey);
      if (ep?.addresses?.length) {
        const eid = `ep-${sanitizeId(`${iid}::${s.skey}`)}`;
        endpointIdByKey.set(s.skey, eid);
        nodes.push({
          id: eid,
          type: "endpoints",
          position: { x: blockX + col * 3.15, y: svcY },
          data: {
            label: "Endpoints",
            serviceName: s.name,
            ips: ep.addresses,
            ports: ep.ports,
          },
        });
        edges.push({
          id: `e-${s.sid}-${eid}-${edgeIdx++}`,
          source: s.sid,
          target: eid,
          type: edgeType,
          label: "Pod IP",
          style: { stroke: "#0d9488" },
        });
      }
    }

    // 3) Resize region to fit content
    const region = nodes.find((n) => n.id === regionId);
    if (region) {
      const h = Math.max(760, maxY - 10);
      region.style = { ...(region.style ?? {}), height: h };
    }
  }

  return { nodes, edges };
}
