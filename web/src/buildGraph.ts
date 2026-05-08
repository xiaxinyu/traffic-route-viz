import { MarkerType, type Edge, type Node } from "reactflow";
import { ingressVsPathOverlaps } from "./istioIngressPathMatch";
import type { ParseResult } from "./k8sParser";

function resourceKey(ns: string | undefined, name: string): string {
  return ns ? `${ns}/${name}` : name;
}

/**
 * Ingress YAML only carries service name; backend namespace is inferred as Ingress namespace,
 * which may differ from where the gateway Service actually lives (e.g. istio-system).
 * If exactly one Service `name` exists in the parsed bundle, unify to its key for correct Service metadata / endpoints on the canvas.
 */
function resolveCanonicalServiceKey(
  inferredNs: string | undefined,
  serviceName: string,
  serviceByKey: Map<string, { key: string; name: string }>,
): string {
  const direct = resourceKey(inferredNs, serviceName);
  if (!serviceName || serviceName === "?") return direct;
  if (serviceByKey.has(direct)) return direct;
  const hits = [...serviceByKey.values()].filter((s) => s.name === serviceName);
  if (hits.length === 1) return hits[0]!.key;
  return direct;
}

/** Backend Service name portion of `namespace/name` Service key (lowercase). */
function serviceBackendNameFromKey(serviceKey: string): string {
  const i = serviceKey.indexOf("/");
  const raw = i >= 0 ? serviceKey.slice(i + 1) : serviceKey;
  return raw.trim().toLowerCase();
}

export function buildFlowGraph(parsed: ParseResult): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // Spacing tuned for readability: keep lines visible even with many nodes.
  // Increase horizontal spacing aggressively so edges are clearly visible.
  const col = 440;
  /**
   * Estimated card heights + gaps for deterministic non-overlap within an Area (conservative vs FlowNodes).
   * When changing node UI padding/content, revisit these constants and §7.0 in HARNESS_ENGINEERING.md.
   */
  const LAYOUT_EST_ENTRY_CARD_H = 156; // Ingress / VirtualService headline card
  const LAYOUT_EST_ISTIO_GW_H = 136;
  const LAYOUT_ISTIO_GW_STACK_GAP = 24;
  const LAYOUT_EST_HOST_CARD_H = 144;
  const LAYOUT_EST_ROUTE_CARD_H = 132;
  const LAYOUT_ROUTE_STACK_GAP = 22;
  const LAYOUT_ROUTE_BELOW_HOST = 18;
  const LAYOUT_AFTER_HOST_GROUP = 36; // whitespace after last route of a Host block before next Host
  const LAYOUT_TOP_ROW_TAIL = 28; // clearance belowIngress row & Istio Gateway column before Host chain
  const LAYOUT_EST_SERVICE_CARD_H = 182;
  const LAYOUT_SERVICE_STACK_GAP = 28;
  const LAYOUT_AFTER_SERVICE_PLUS_DR_GAP = 32; // DestinationRule stacked under Service
  const LAYOUT_EST_DR_CARD_H = 120;
  const baseX = 40;
  const baseY = 8;
  const areaGapX = 80;
  const areaGapY = 90;
  /** 分区标题区（Ingress 名、命名空间、来源等）高度预留，避免子节点与标题文字重叠 */
  const regionHeaderReserveY = 140;
  const ingressBlockMinW = Math.round(col * 4.2);
  /** 右侧 Endpoints 卡片宽度上界（用于估算区域宽度） */
  const cardMaxW = 360;
  const leftPad = 24;
  const sanitizeId = (v: string) => v.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const edgeType: Edge["type"] = "smoothstep";
  const makeEditableEdge = (e: Edge): Edge => ({
    ...e,
    selectable: e.selectable ?? true,
    deletable: e.deletable ?? true,
    updatable: (e as Edge & { updatable?: boolean }).updatable ?? true,
    reconnectable: (e as Edge & { reconnectable?: boolean }).reconnectable ?? true,
    focusable: e.focusable ?? true,
    interactionWidth: e.interactionWidth ?? 40,
  });
  const arrow = (color: string) => ({ type: MarkerType.ArrowClosed as const, color });

  const serviceByKey = new Map<string, (typeof parsed.services)[0]>();
  for (const s of parsed.services) {
    serviceByKey.set(s.key, s);
  }
  const drByServiceKey = new Map<string, (typeof parsed.destinationRules)[0]>();
  for (const d of parsed.destinationRules ?? []) {
    drByServiceKey.set(d.key, d);
  }
  const gwByKey = new Map<string, (typeof parsed.gateways)[0]>();
  for (const g of parsed.gateways ?? []) {
    gwByKey.set(g.key, g);
  }
  const epByKey = new Map<string, (typeof parsed.endpoints)[0]>();
  for (const e of parsed.endpoints) {
    epByKey.set(e.key, e);
  }

  const ingId = (kind: string, ns: string | undefined, name: string) =>
    `ing-${kind.toLowerCase()}-${resourceKey(ns, name).replace(/[^a-zA-Z0-9/_-]/g, "_")}`;

  // ---- Layout: partition by ingress, then by host, then by route list ----
  // Area ordering must be stable and user-friendly: business entries first, gateway config last.
  const kindWeight = (k: string): number => {
    if (k === "Ingress") return 10;
    if (k === "VirtualService") return 20;
    if (k === "HTTPProxy") return 90; // Contour Gateway goes to the right side
    return 50;
  };

  const parseExampleTier = (
    sourceFiles: string[] | undefined,
  ): {
    tierCode: "01" | "02" | "03";
    tierIndex: 1 | 2 | 3;
    /** A human-friendly folder hint without 01/02/03 prefix, e.g. "dce5-global / active01" */
    effectiveFolderHint: string;
    activeWeight: number;
  } | null => {
    const files = sourceFiles ?? [];
    const pick = files.find(Boolean) ?? "";
    const segs = pick.split("/").filter(Boolean);
    const tierSeg = segs.find((s) => /^(0[1-3])[-_]/.test(s));
    const m = tierSeg?.match(/^(0[1-3])[-_](.+)$/);
    if (!m) return null;
    const tierCode = m[1] as "01" | "02" | "03";
    const tierIndex = (tierCode === "01" ? 1 : tierCode === "02" ? 2 : 3) as 1 | 2 | 3;

    const lower = segs.map((s) => s.toLowerCase());
    const activeWeight = lower.some((s) => s.includes("active01"))
      ? 10
      : lower.some((s) => s.includes("active02"))
        ? 20
        : 50;

    const folderSegs = segs.slice(0, -1).map((s) => s.replace(/^(0[1-3])[-_]/, ""));
    const effectiveFolderHint = folderSegs.join(" / ");
    return { tierCode, tierIndex, effectiveFolderHint, activeWeight };
  };

  const hasTieredExample = parsed.ingresses.some((ing) => !!parseExampleTier(ing.sourceFiles));

  const orderedIngresses = [...parsed.ingresses].sort((a, b) => {
    if (hasTieredExample) {
      const ta = parseExampleTier(a.sourceFiles);
      const tb = parseExampleTier(b.sourceFiles);
      const tw = (ta?.tierIndex ?? 99) - (tb?.tierIndex ?? 99);
      if (tw !== 0) return tw;
      const aw = (ta?.activeWeight ?? 99) - (tb?.activeWeight ?? 99);
      if (aw !== 0) return aw;
      const fa = (ta?.effectiveFolderHint ?? "").localeCompare(tb?.effectiveFolderHint ?? "");
      if (fa !== 0) return fa;
    }

    const dw = kindWeight(a.kind) - kindWeight(b.kind);
    if (dw !== 0) return dw;
    const ans = (a.namespace ?? "").localeCompare(b.namespace ?? "");
    if (ans !== 0) return ans;
    return a.name.localeCompare(b.name);
  });

  const ingressIndexById = new Map<string, number>();
  orderedIngresses.forEach((ing, idx) => {
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
  // Global lookup: serviceKey(ns/name) -> all Service nodes already rendered (multi-Ingress × multi-gateway wiring).
  // Used for cross-area wiring like "Ingress Service -> Contour Gateway" / "Ingress Service -> Istio Gateway".
  const globalServiceNodesByKey = new Map<
    string,
    { nodeId: string; ownerKind: string; ingressPartitionId?: string }[]
  >();
  const pendingServiceToGatewayEdges: { serviceKey: string; gatewayNodeId: string }[] = [];
  /** Istio Gateway node id + owning VirtualService partition (for URI rule intersection checks). */
  const globalIstioGatewayTargetsByGatewayName = new Map<
    string,
    { nodeId: string; vsPartitionId: string }[]
  >();

  const ingressRoutesToBackendService = (
    ingressPartitionId: string,
    canonicalServiceKey: string,
  ): { path: string; pathType?: string }[] => {
    const list = routesByIngress.get(ingressPartitionId) ?? [];
    const out: { path: string; pathType?: string }[] = [];
    for (const r of list) {
      if (r.ingressKind !== "Ingress") continue;
      const svcNs = r.serviceNamespace ?? r.ingressNs;
      const sk = resolveCanonicalServiceKey(svcNs, r.serviceName, serviceByKey);
      if (sk !== canonicalServiceKey) continue;
      out.push({ path: r.path, pathType: r.pathType });
    }
    return out;
  };

  const virtualServiceHttpPaths = (
    vsPartitionId: string,
  ): { path: string; pathType?: string }[] => {
    const list = routesByIngress.get(vsPartitionId) ?? [];
    return list
      .filter((r) => r.ingressKind === "VirtualService")
      .map((r) => ({ path: r.path, pathType: r.pathType }));
  };

  const istioIngressGatewayPathMayOverlap = (
    ingressPartitionId: string,
    canonicalServiceKey: string,
    vsPartitionId: string,
  ): boolean => {
    const ips = ingressRoutesToBackendService(ingressPartitionId, canonicalServiceKey);
    const vps = virtualServiceHttpPaths(vsPartitionId);
    if (!ips.length || !vps.length) return false;
    return ips.some((ip) =>
      vps.some((vp) => ingressVsPathOverlaps(ip.path, ip.pathType, vp.path, vp.pathType)),
    );
  };

  // Placement cursors:
  // - If files are imported as a tiered folder (01/02/03), use 3 fixed columns and stack vertically.
  // - Otherwise fall back to a simple multi-column grid.
  const lanePitchX = Math.round(col * 7.2) + areaGapX; // wide enough for a full region chain + comfortable edges
  const laneY: Record<1 | 2 | 3, number> = { 1: baseY, 2: baseY, 3: baseY };
  const fallbackMaxAreasPerRow = 4;
  let fallbackColIdx = 0;
  let fallbackCursorX = baseX;
  let fallbackCursorY = baseY;
  let fallbackRowMaxH = 0;

  for (const ing of orderedIngresses) {
    const iid = ingId(ing.kind, ing.namespace, ing.name);
    // We still use the stable ingressIndex for partitionIndex label, but placement is grid-based.
    const blockIdx = ingressIndexById.get(iid) ?? 0;
    const isContourGateway = ing.kind === "HTTPProxy";

    const sourceFiles = ing.sourceFiles ?? [];
    const tier = parseExampleTier(sourceFiles);
    const sourceSummary =
      sourceFiles.length > 0
        ? `来源文件：${sourceFiles.join("，")}`
        : "来源文件：当前为编辑器内 YAML 文本（未绑定本地文件名）";

    const ingressRoutes = routesByIngress.get(iid) ?? [];
    const vsGatewayRefs =
      ing.kind === "VirtualService"
        ? [...new Set(ingressRoutes.flatMap((r) => r.gateways ?? []))].filter(
            (ref) => ref && ref !== "mesh" && ref !== "istio:mesh",
          )
        : [];
    const hasIstioGateway = ing.kind === "VirtualService" && vsGatewayRefs.length > 0;
    // Order hosts by name for stability
    const hosts = [...new Set(ingressRoutes.map((r) => r.host))].sort((a, b) => a.localeCompare(b));

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
          tierCode: tier?.tierCode,
          tierHint: tier?.effectiveFolderHint,
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
    // For Contour Gateway areas we enforce a strict left-to-right reading chain:
    // Contour Gateway -> HTTPProxy -> Host -> Route -> Service(upstream) -> Endpoints(Pod IP)
    const contour = {
      gatewayX: leftPad,
      httpProxyX: leftPad + col * 1.15,
      hostX: leftPad + col * 2.25,
      routeX: leftPad + col * 3.3,
      serviceX: leftPad + col * 4.25,
      endpointsX: leftPad + col * 5.2,
    };

    const vsOffsetX = hasIstioGateway ? col * 0.85 : 0;
    nodes.push({
      id: iid,
      type: "ingress",
      parentNode: regionId,
      extent: "parent",
      draggable: true,
      position: {
        x: isContourGateway
          ? contour.gatewayX
          : leftPad + (ing.kind === "VirtualService" ? vsOffsetX : 0),
        y: layoutOriginY,
      },
      data: {
        label: ing.name,
        subtitle: ing.namespace ? `namespace: ${ing.namespace}` : undefined,
        className: ing.className,
        kind: ing.kind,
        tls: ing.tls,
        loadBalancerIps: ing.loadBalancerIps,
      },
    });

    let maxY = layoutOriginY + 200;
    let maxX = leftPad + 260;
    // Ensure region width always includes the whole Contour Gateway chain.
    if (isContourGateway) {
      maxX = Math.max(maxX, contour.httpProxyX + cardMaxW);
    }

    // Istio Gateway node(s): stack with explicit spacing; bottom informs where Host blocks may start vertically.
    let istioGatewaysStackBottom = layoutOriginY;
    if (hasIstioGateway) {
      const gwX = leftPad;
      let gwY = layoutOriginY + 6;
      for (const ref of vsGatewayRefs) {
        const [nsMaybe, nameMaybe] = ref.includes("/")
          ? ref.split("/", 2)
          : [ing.namespace ?? undefined, ref];
        const gwKey = resourceKey(nsMaybe || undefined, nameMaybe || ref);
        const gwi = gwByKey.get(gwKey);
        const gid = `istio-gw-${sanitizeId(`${iid}::${gwKey}`)}`;
        nodes.push({
          id: gid,
          type: "istioGateway",
          parentNode: regionId,
          extent: "parent",
          draggable: true,
          position: { x: gwX, y: gwY },
          data: {
            label: nameMaybe || ref,
            subtitle: nsMaybe ? `namespace: ${nsMaybe}` : undefined,
            servers: gwi?.servers,
            selector: gwi?.selector,
          },
        });
        const gwWireName = (nameMaybe ?? ref ?? "").trim().toLowerCase();
        if (gwWireName) {
          const acc = globalIstioGatewayTargetsByGatewayName.get(gwWireName) ?? [];
          acc.push({ nodeId: gid, vsPartitionId: iid });
          globalIstioGatewayTargetsByGatewayName.set(gwWireName, acc);
        }
        edges.push({
          id: `e-${gid}-${iid}-${edgeIdx++}`,
          source: gid,
          target: iid,
          type: edgeType,
          label: "Gateway",
          style: { stroke: "#0ea5e9", strokeWidth: 2.25 },
          markerEnd: arrow("#0ea5e9"),
          labelStyle: { fontSize: 11, fill: "#0f172a", fontWeight: 700 },
          labelBgStyle: { fill: "#e0f2fe", fillOpacity: 0.92 },
        });
        istioGatewaysStackBottom = gwY + LAYOUT_EST_ISTIO_GW_H;
        gwY = istioGatewaysStackBottom + LAYOUT_ISTIO_GW_STACK_GAP;
        maxY = Math.max(maxY, istioGatewaysStackBottom);
        maxX = Math.max(maxX, gwX + cardMaxW);
      }
    }

    /** First Host row Y clears the Ingress/VS headline and (if any) the Istio Gateway stack in the left column. */
    const entryRowBottom = layoutOriginY + LAYOUT_EST_ENTRY_CARD_H;
    const hostBandStartY = Math.max(entryRowBottom, istioGatewaysStackBottom) + LAYOUT_TOP_ROW_TAIL;

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
        markerEnd: arrow("#0f766e"),
      });
    }

    const hostIdByHost = new Map<string, string>();
    const routeYsByService = new Map<string, number[]>();
    const serviceIdByKey = new Map<string, string>();
    const endpointIdByKey = new Map<string, string>();

    // 1) Host + Route: stacked with height estimates so cards never overlap Host↔Route or Host↔Host.
    let hostCursorY = hostBandStartY;
    hosts.forEach((host, hostIdx) => {
      const hid = `host-${sanitizeId(iid)}-${sanitizeId(host)}-${hostIdx}`;
      hostIdByHost.set(host, hid);

      const hostY = hostCursorY;
      maxY = Math.max(maxY, hostY + LAYOUT_EST_HOST_CARD_H);

      // Pick a representative TLS secret for the host (if multiple, first non-empty)
      const tlsSecretName =
        ingressRoutes.find((r) => r.host === host && r.tlsSecretName)?.tlsSecretName ?? undefined;

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
        style: { stroke: "#7c3aed", strokeWidth: 2 },
        markerEnd: arrow("#7c3aed"),
      });

      const hostRoutes = ingressRoutes
        .filter((r) => r.host === host)
        .sort((a, b) => a.path.localeCompare(b.path));

      if (!hostRoutes.length) {
        hostCursorY = hostY + LAYOUT_EST_HOST_CARD_H + LAYOUT_AFTER_HOST_GROUP;
      } else {
        let routeYCursor = hostY + LAYOUT_EST_HOST_CARD_H + LAYOUT_ROUTE_BELOW_HOST;
        hostRoutes.forEach((r, routeIdx) => {
          const routeY = routeYCursor;
          routeYCursor += LAYOUT_EST_ROUTE_CARD_H + LAYOUT_ROUTE_STACK_GAP;
          maxY = Math.max(maxY, routeY + LAYOUT_EST_ROUTE_CARD_H);
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
            style: { stroke: "#7c3aed", strokeWidth: 2 },
            markerEnd: arrow("#7c3aed"),
          });

          const svcNs = r.serviceNamespace ?? r.ingressNs;
          const skey = resolveCanonicalServiceKey(svcNs, r.serviceName, serviceByKey);
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
            style: { stroke: "#4f46e5", strokeWidth: 2.25 },
            labelStyle: { fontSize: 11, fill: "#334155", fontWeight: 500 },
            labelBgStyle: { fill: "#e0e7ff", fillOpacity: 0.95 },
            markerEnd: arrow("#4f46e5"),
          });
        });

        hostCursorY = routeYCursor + LAYOUT_AFTER_HOST_GROUP;
      }
    });

    maxY = Math.max(maxY, hostCursorY);

    // 2) Place service nodes near median of their routes, then collision-resolve
    const serviceEntries = [...serviceIdByKey.entries()].map(([svcScoped, sid]) => {
      const [, skey] = svcScoped.split("::");
      const [ns, name] = skey.includes("/") ? skey.split("/", 2) : [undefined, skey];
      const desiredY = medianOf(routeYsByService.get(svcScoped) ?? [], layoutOriginY);
      return { svcScoped, sid, skey, ns, name, desiredY };
    });
    serviceEntries.sort((a, b) => a.desiredY - b.desiredY);
    const serviceVerticalStep = LAYOUT_EST_SERVICE_CARD_H + LAYOUT_SERVICE_STACK_GAP;
    let lastY = -Infinity;
    for (const s of serviceEntries) {
      const svcY = Math.max(s.desiredY, lastY + serviceVerticalStep);
      lastY = svcY;
      maxY = Math.max(maxY, svcY + LAYOUT_EST_SERVICE_CARD_H);

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

      // DestinationRule node (Istio): attach policy/subsets to Service for clarity
      const dri = drByServiceKey.get(s.skey);
      if (dri && (dri.subsets?.length || si?.istioSubsets?.length)) {
        const drId = `dr-${sanitizeId(`${iid}::${s.skey}`)}`;
        // Place DR under Service with reserved band (see LAYOUT_AFTER_SERVICE_PLUS_DR_GAP).
        const drY = svcY + LAYOUT_EST_SERVICE_CARD_H + LAYOUT_AFTER_SERVICE_PLUS_DR_GAP;
        const drX = svcX;
        nodes.push({
          id: drId,
          type: "destinationRule",
          parentNode: regionId,
          extent: "parent",
          draggable: true,
          position: { x: drX, y: drY },
          data: {
            label: dri.name,
            subtitle: dri.namespace ? `namespace: ${dri.namespace}` : undefined,
            host: dri.host,
            subsets: dri.subsets ?? si?.istioSubsets ?? [],
          },
        });
        edges.push({
          id: `e-${s.sid}-${drId}-${edgeIdx++}`,
          source: s.sid,
          target: drId,
          type: edgeType,
          label: "DestinationRule",
          style: { stroke: "#0ea5e9", strokeWidth: 2, strokeDasharray: "5 4" },
          markerEnd: arrow("#0ea5e9"),
          labelStyle: { fontSize: 11, fill: "#0f172a", fontWeight: 700 },
          labelBgStyle: { fill: "#e0f2fe", fillOpacity: 0.92 },
        });
        maxY = Math.max(maxY, drY + LAYOUT_EST_DR_CARD_H);
      }

      const list = globalServiceNodesByKey.get(s.skey) ?? [];
      if (!list.some((x) => x.nodeId === s.sid)) {
        list.push({
          nodeId: s.sid,
          ownerKind: ing.kind,
          ingressPartitionId: ing.kind === "Ingress" ? iid : undefined,
        });
        globalServiceNodesByKey.set(s.skey, list);
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
          style: { stroke: "#0d9488", strokeWidth: 2.25 },
          markerEnd: arrow("#0d9488"),
        });
        maxY = Math.max(maxY, svcY + LAYOUT_EST_SERVICE_CARD_H);
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
      const h = Math.max(620, maxY + 36);
      const w = Math.max(ingressBlockMinW, Math.ceil(maxX + leftPad));
      region.style = { ...(region.style ?? {}), height: h, width: w };

      if (hasTieredExample && tier) {
        // ---- Tier lanes: 01 -> left, 02 -> middle, 03 -> right; one area per row in each lane ----
        const x = baseX + (tier.tierIndex - 1) * lanePitchX;
        const y = laneY[tier.tierIndex];
        region.position = { x, y };
        laneY[tier.tierIndex] += h + areaGapY;
      } else {
        // ---- Fallback grid placement (max 4 areas per row; auto-wrap) ----
        region.position = { x: fallbackCursorX, y: fallbackCursorY };
        fallbackRowMaxH = Math.max(fallbackRowMaxH, h);
        fallbackCursorX += w + areaGapX;
        fallbackColIdx += 1;
        if (fallbackColIdx >= fallbackMaxAreasPerRow) {
          fallbackColIdx = 0;
          fallbackCursorX = baseX;
          fallbackCursorY += fallbackRowMaxH + areaGapY;
          fallbackRowMaxH = 0;
        }
      }
    }
  }

  // Resolve cross-area edges after all nodes exist (order-independent).
  for (const { serviceKey, gatewayNodeId } of pendingServiceToGatewayEdges) {
    const svcs = globalServiceNodesByKey.get(serviceKey);
    if (!svcs?.length) continue;
    for (const svc of svcs) {
      edges.push({
        id: `e-${svc.nodeId}-${gatewayNodeId}-gateway-${edgeIdx++}`,
        source: svc.nodeId,
        target: gatewayNodeId,
        sourceHandle: "s-right",
        targetHandle: "t-left",
        type: edgeType,
        label: "Contour Gateway",
        style: { stroke: "#0f766e", strokeWidth: 2.25, strokeDasharray: "6 4" },
        labelStyle: { fontSize: 11, fill: "#0f172a", fontWeight: 700 },
        labelBgStyle: { fill: "#ccfbf1", fillOpacity: 0.92 },
        markerEnd: arrow("#0f766e"),
      });
    }
  }

  // Istio M×N: same gateway **name** as backend Service, and at least one Ingress path ↔ VS HTTP URI rule overlap
  // (Prefix / Exact / Regex heuristics in `istioIngressPathMatch.ts`).
  const seenSvcToIstioGw = new Set<string>();
  for (const [serviceKey, svcList] of globalServiceNodesByKey.entries()) {
    const sn = serviceBackendNameFromKey(serviceKey);
    if (!sn) continue;
    const gwTargets = globalIstioGatewayTargetsByGatewayName.get(sn);
    if (!gwTargets?.length) continue;
    for (const svc of svcList) {
      if (svc.ownerKind !== "Ingress" || !svc.ingressPartitionId) continue;
      for (const { nodeId: gwNodeId, vsPartitionId } of gwTargets) {
        if (!istioIngressGatewayPathMayOverlap(svc.ingressPartitionId, serviceKey, vsPartitionId)) {
          continue;
        }
        const pair = `${svc.nodeId}>${gwNodeId}`;
        if (seenSvcToIstioGw.has(pair)) continue;
        seenSvcToIstioGw.add(pair);
        edges.push({
          id: `e-${svc.nodeId}-${gwNodeId}-istio-gateway-${edgeIdx++}`,
          source: svc.nodeId,
          target: gwNodeId,
          sourceHandle: "s-right",
          type: edgeType,
          label: "Istio Gateway",
          style: { stroke: "#0ea5e9", strokeWidth: 2.25, strokeDasharray: "6 4" },
          labelStyle: { fontSize: 11, fill: "#0f172a", fontWeight: 700 },
          labelBgStyle: { fill: "#e0f2fe", fillOpacity: 0.92 },
          markerEnd: arrow("#0ea5e9"),
        });
      }
    }
  }

  return { nodes, edges: edges.map(makeEditableEdge) };
}
