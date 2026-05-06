import type { Edge, Node } from "reactflow";
import type { ParseResult } from "./k8sParser";

function resourceKey(ns: string | undefined, name: string): string {
  return ns ? `${ns}/${name}` : name;
}

export function buildFlowGraph(parsed: ParseResult): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // Spacing tuned for readability: keep lines visible even with many nodes.
  // Increase horizontal spacing aggressively so edges are clearly visible.
  const col = 440;
  const hostGap = 220;
  const routeGap = 84;
  const serviceGap = 210;
  const baseX = 40;
  const baseY = 20;
  /** Ingress 分区排版：一行最多放 4 个，超出自动换行 */
  const maxAreasPerRow = 4;
  const areaGapX = 80;
  const areaGapY = 90;
  /** 分区标题区（Ingress 名、命名空间、来源等）高度预留，避免子节点与标题文字重叠 */
  const regionHeaderReserveY = 168;
  const ingressBlockMinW = Math.round(col * 4.2);
  /** 右侧 Endpoints 卡片宽度上界（用于估算区域宽度） */
  const cardMaxW = 360;
  const leftPad = 24;
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

  const ingId = (kind: string, ns: string | undefined, name: string) =>
    `ing-${kind.toLowerCase()}-${resourceKey(ns, name).replace(/[^a-zA-Z0-9/_-]/g, "_")}`;

  // ---- Layout: partition by ingress, then by host, then by route list ----
  const ingressIndexById = new Map<string, number>();
  parsed.ingresses.forEach((ing, idx) => {
    ingressIndexById.set(ingId(ing.kind, ing.namespace, ing.name), idx);
  });

  // Group routes by ingress -> host
  const routesByIngress = new Map<string, typeof parsed.routes>();
  for (const r of parsed.routes) {
    const iid = ingId(r.ingressKind ?? "Ingress", r.ingressNs, r.ingressName);
    const list = routesByIngress.get(iid) ?? [];
    list.push(r);
    routesByIngress.set(iid, list);
  }

  const medianOf = (nums: number[], fallback: number): number => {
    if (!nums.length) return fallback;
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
  };

  let edgeIdx = 0;
  // Global lookup: serviceKey(ns/name) -> a node id already rendered on canvas.
  // Used for cross-area wiring like "Ingress Service -> Contour Gateway".
  const globalServiceNodeIdByKey = new Map<string, { nodeId: string; ownerKind: string }>();
  const pendingServiceToGatewayEdges: { serviceKey: string; gatewayNodeId: string }[] = [];
  // Grid placement cursors (avoid "flowing" infinite horizontal layout)
  let rowIdx = 0;
  let colIdx = 0;
  let cursorX = baseX;
  let cursorY = baseY;
  let rowMaxH = 0;

  for (const ing of parsed.ingresses) {
    const iid = ingId(ing.kind, ing.namespace, ing.name);
    // We still use the stable ingressIndex for partitionIndex label, but placement is grid-based.
    const blockIdx = ingressIndexById.get(iid) ?? 0;
    const isContourGateway = ing.kind === "HTTPProxy";

    const sourceFiles = ing.sourceFiles ?? [];
    const sourceSummary =
      sourceFiles.length > 0
        ? `来源文件：${sourceFiles.join("，")}`
        : "来源文件：当前为编辑器内 YAML 文本（未绑定本地文件名）";

    const ingressRoutes = routesByIngress.get(iid) ?? [];
    // Order hosts by name for stability
    const hosts = [...new Set(ingressRoutes.map((r) => r.host))].sort((a, b) =>
      a.localeCompare(b),
    );

    // Region panel first: children use parentNode so dragging the panel moves everything.
    const regionId = `region-${sanitizeId(iid)}`;
    // Child nodes are positioned relative to the region.
    const layoutOriginY = regionHeaderReserveY;

    const regionNodeIdx =
      (nodes.push({
      id: regionId,
      type: "ingressRegion",
      position: { x: 0, y: 0 }, // set later by grid placement
      data: {
        partitionIndex: blockIdx + 1,
        entryKind: ing.kind,
        ingressName: ing.name,
        namespace: ing.namespace ?? "—",
        sourceSummary,
        sourceFiles,
      },
      style: {
        width: ingressBlockMinW,
        height: 760,
        padding: 0,
        borderRadius: 16,
      },
      selectable: true,
      draggable: true,
    }) as unknown as number) - 1;

    // Ingress / VirtualService / Contour Gateway node (child of region — moves with partition drag)
    // Principle: for Contour Gateway areas, gateway stays on the far right; its children stay on the left.
    const contour = {
      gatewayX: leftPad + col * 5.05,
      httpProxyX: leftPad,
      hostX: leftPad + col * 1.08,
      routeX: leftPad + col * 2.10,
      serviceX: leftPad + col * 3.10,
      endpointsX: leftPad + col * 4.05,
    };

    nodes.push({
      id: iid,
      type: "ingress",
      parentNode: regionId,
      extent: "parent",
      draggable: true,
      position: { x: isContourGateway ? contour.gatewayX : leftPad, y: layoutOriginY },
      data: {
        label: ing.name,
        subtitle: ing.namespace ? `namespace: ${ing.namespace}` : undefined,
        className: ing.className,
        kind: ing.kind,
        tls: ing.tls,
        loadBalancerIps: ing.loadBalancerIps,
      },
    });

    // For Contour gateway regions: add an explicit HTTPProxy config node so the chain can be
    // Service(gateway) -> Contour Gateway -> HTTPProxy -> Host -> Route -> Service(upstream).
    const httpProxyNodeId = ing.kind === "HTTPProxy" ? `${iid}-httpproxy` : null;
    if (httpProxyNodeId) {
      nodes.push({
        id: httpProxyNodeId,
        type: "httpProxy",
        parentNode: regionId,
        extent: "parent",
        draggable: true,
        position: { x: contour.httpProxyX, y: layoutOriginY + 6 },
        data: {
          label: "HTTPProxy Routes",
          subtitle: ing.namespace ? `namespace: ${ing.namespace}` : undefined,
        },
      });
      edges.push({
        id: `e-${iid}-${httpProxyNodeId}-${edgeIdx++}`,
        source: iid,
        target: httpProxyNodeId,
        type: edgeType,
        label: "HTTPProxy",
        style: { stroke: "#0f766e" },
        labelStyle: { fontSize: 11, fill: "#0f172a", fontWeight: 700 },
        labelBgStyle: { fill: "#ccfbf1", fillOpacity: 0.92 },
      });
    }

    const hostIdByHost = new Map<string, string>();
    const routeYsByService = new Map<string, number[]>();
    const serviceIdByKey = new Map<string, string>();
    const endpointIdByKey = new Map<string, string>();

    let maxY = layoutOriginY + 200;
    let maxX = leftPad + 260;

    // 1) Place hosts + routes (a clean vertical list per host)
    hosts.forEach((host, hostIdx) => {
      const hid = `host-${sanitizeId(iid)}-${sanitizeId(host)}-${hostIdx}`;
      hostIdByHost.set(host, hid);

      const hostY = layoutOriginY + 40 + hostIdx * hostGap;
      maxY = Math.max(maxY, hostY);

      // Pick a representative TLS secret for the host (if multiple, first non-empty)
      const tlsSecretName =
        ingressRoutes.find((r) => r.host === host && r.tlsSecretName)?.tlsSecretName ??
        undefined;

      const hostX = isContourGateway ? contour.hostX : leftPad + col * 1.12;
      maxX = Math.max(maxX, hostX + cardMaxW);
      nodes.push({
        id: hid,
        type: "host",
        parentNode: regionId,
        extent: "parent",
        draggable: true,
        position: { x: hostX, y: hostY },
        data: { label: host, tlsSecretName, ingressName: ing.name, entryKind: ing.kind },
      });

      edges.push({
        id: `e-${iid}-${hid}-${edgeIdx++}`,
        source: httpProxyNodeId ?? iid,
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

        const routeX = isContourGateway ? contour.routeX : leftPad + col * 2.05;
        maxX = Math.max(maxX, routeX + cardMaxW);
        nodes.push({
          id: routeId,
          type: "route",
          parentNode: regionId,
          extent: "parent",
          draggable: true,
          position: { x: routeX, y: routeY },
          data: {
            path: r.path,
            pathType: r.pathType,
            serviceName: r.serviceName,
            servicePort: r.servicePort,
            upstreamServiceName: r.upstreamServiceName,
            upstreamServicePort: r.upstreamServicePort,
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
      const desiredY = medianOf(routeYsByService.get(svcScoped) ?? [], layoutOriginY);
      return { svcScoped, sid, skey, ns, name, desiredY };
    });
    serviceEntries.sort((a, b) => a.desiredY - b.desiredY);
    let lastY = -Infinity;
    for (const s of serviceEntries) {
      const svcY = Math.max(s.desiredY, lastY + serviceGap);
      lastY = svcY;
      maxY = Math.max(maxY, svcY);

      const si = serviceByKey.get(s.skey);
      const svcX = isContourGateway ? contour.serviceX : leftPad + col * 3.1;
      maxX = Math.max(maxX, svcX + cardMaxW);
      nodes.push({
        id: s.sid,
        type: "service",
        parentNode: regionId,
        extent: "parent",
        draggable: true,
        position: { x: svcX, y: svcY },
        data: {
          label: s.name,
          subtitle: s.ns ? `namespace: ${s.ns}` : undefined,
          type: si?.type,
          clusterIP: si?.clusterIP,
          ports: si?.ports,
          istioSubsets: si?.istioSubsets,
        },
      });

      // Record a global handle for cross-area edges.
      // Prefer non-HTTPProxy owners so gateway service resolves to the "real" Service node.
      const prev = globalServiceNodeIdByKey.get(s.skey);
      if (!prev || (prev.ownerKind === "HTTPProxy" && ing.kind !== "HTTPProxy")) {
        globalServiceNodeIdByKey.set(s.skey, { nodeId: s.sid, ownerKind: ing.kind });
      }

      const ep = epByKey.get(s.skey);
      if (ep?.addresses?.length) {
        const eid = `ep-${sanitizeId(`${iid}::${s.skey}`)}`;
        endpointIdByKey.set(s.skey, eid);
        const epX = isContourGateway ? contour.endpointsX : leftPad + col * 4.22;
        maxX = Math.max(maxX, epX + cardMaxW);
        nodes.push({
          id: eid,
          type: "endpoints",
          parentNode: regionId,
          extent: "parent",
          draggable: true,
          position: { x: epX, y: svcY },
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

    // 2.5) For Contour Gateway: enforce Ingress -> Service(gateway) -> Contour Gateway -> HTTPProxy.
    if (ing.kind === "HTTPProxy") {
      // IMPORTANT: do NOT create a duplicate gateway Service inside this Area.
      // Instead, link from the already-rendered Service node (usually from an Ingress area).
      const gatewayServiceKey = resourceKey(ing.namespace, ing.name);
      pendingServiceToGatewayEdges.push({ serviceKey: gatewayServiceKey, gatewayNodeId: iid });
    }

    // 3) Resize region to fit content
    const region = nodes[regionNodeIdx];
    if (region) {
      const h = Math.max(760, maxY + 22);
      const w = Math.max(ingressBlockMinW, Math.ceil(maxX + leftPad));
      region.style = { ...(region.style ?? {}), height: h, width: w };

      // ---- Grid placement (max 4 areas per row; auto-wrap) ----
      region.position = { x: cursorX, y: cursorY };
      rowMaxH = Math.max(rowMaxH, h);
      cursorX += w + areaGapX;
      colIdx += 1;
      if (colIdx >= maxAreasPerRow) {
        colIdx = 0;
        rowIdx += 1;
        cursorX = baseX;
        cursorY += rowMaxH + areaGapY;
        rowMaxH = 0;
      }
    }
  }

  // Resolve cross-area edges after all nodes exist (order-independent).
  for (const { serviceKey, gatewayNodeId } of pendingServiceToGatewayEdges) {
    const svc = globalServiceNodeIdByKey.get(serviceKey);
    if (!svc) continue;
    edges.push({
      id: `e-${svc.nodeId}-${gatewayNodeId}-gateway-${edgeIdx++}`,
      source: svc.nodeId,
      target: gatewayNodeId,
      sourceHandle: "s-right",
      targetHandle: "t-left",
      type: edgeType,
      label: "Contour Gateway",
      style: { stroke: "#0f766e", strokeDasharray: "6 4" },
      labelStyle: { fontSize: 11, fill: "#0f172a", fontWeight: 700 },
      labelBgStyle: { fill: "#ccfbf1", fillOpacity: 0.92 },
    });
  }

  return { nodes, edges };
}
