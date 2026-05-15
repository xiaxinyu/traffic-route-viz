import { describe, expect, it } from "vitest";

import { buildFlowGraph } from "./buildGraph";
import { parseK8sYaml } from "./k8sParser";
import { mergeParseResults } from "./mergeYamlBundles";

const INGRESS_01 = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: edge-global
  namespace: traffic
spec:
  ingressClassName: nginx
  rules:
    - host: edge.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: nginx-forward
                port:
                  number: 80
`;

const INGRESS_02 = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: core-ingress
  namespace: traffic
spec:
  ingressClassName: nginx
  rules:
    - host: edge.example.com
      http:
        paths:
          - path: /api/v1
            pathType: Prefix
            backend:
              service:
                name: app-svc
                port:
                  number: 8080
`;

const GATEWAY_AND_VS = `apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: rts-istio-ingress-gateway
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
      hosts:
        - "*"
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vs-app
  namespace: demo
spec:
  gateways:
    - istio-system/rts-istio-ingress-gateway
  hosts:
    - app.example.com
  http:
    - match:
        - uri:
            prefix: /api
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            subset: blue
            port:
              number: 9080
          weight: 70
        - destination:
            host: ratings.demo.svc.cluster.local
            subset: green
            port:
              number: 9080
          weight: 30
---
apiVersion: v1
kind: Service
metadata:
  name: reviews
  namespace: demo
---
apiVersion: v1
kind: Service
metadata:
  name: ratings
  namespace: demo
`;

/** Two weighted subsets to the same Service → parallel Route→Service edges (same endpoints). */
const VS_SAME_SVC_WEIGHTED = `apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vs-same-svc
  namespace: demo
spec:
  gateways:
    - istio-system/rts-istio-ingress-gateway
  hosts:
    - app.example.com
  http:
    - match:
        - uri:
            prefix: /api
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            subset: blue
            port:
              number: 9080
          weight: 80
        - destination:
            host: reviews.demo.svc.cluster.local
            subset: green
            port:
              number: 9080
          weight: 20
---
apiVersion: v1
kind: Service
metadata:
  name: reviews
  namespace: demo
`;

describe("buildFlowGraph Kubernetes Ingress controller lane", () => {
  it("adds global ingressController (Istio-like) and wires trunk → junction → Ingress", () => {
    const parsed = parseK8sYaml(INGRESS_01, "01-edge/edge-global.yaml");
    const { nodes, edges } = buildFlowGraph(parsed);
    const region = nodes.find((n) => n.type === "ingressRegion" && n.data?.ingressName === "edge-global");
    expect(region).toBeTruthy();
    const ic = nodes.find(
      (n) => n.type === "ingressController" && n.data?.globalK8sIngressController === true,
    );
    expect(ic).toBeTruthy();
    expect(ic?.parentNode).toBeUndefined();
    const ing = nodes.find((n) => n.type === "ingress" && n.data?.label === "edge-global");
    expect(ing).toBeTruthy();
    const trunk = edges.find((e) => e.source === ic?.id && String(e.target ?? "").includes("junction"));
    expect(trunk).toBeTruthy();
    expect(trunk?.markerEnd).toBeUndefined();
    expect(trunk?.label).toBeUndefined();
    expect(trunk?.type).toBe("step");
    const junctionId = trunk?.target;
    expect(junctionId).toBeTruthy();
    const branch = edges.find((e) => e.source === junctionId && e.target === ing?.id);
    expect(branch).toBeTruthy();
    expect(branch?.markerEnd).toBeTruthy();
    expect(branch?.type).toBe("step");
  });

  it("uses generic controller label when ingressClassName is not nginx", () => {
    const yaml = INGRESS_01.replace("ingressClassName: nginx", "ingressClassName: traefik");
    const parsed = parseK8sYaml(yaml, "t.yaml");
    const { nodes } = buildFlowGraph(parsed);
    const ic = nodes.find((n) => n.type === "ingressController");
    expect(ic?.data?.label).toBe("Ingress controller");
    expect(String(ic?.data?.subtitle ?? "")).toContain("traefik");
  });

  it("does not add ingressController for VirtualService partitions", () => {
    const parsed = mergeParseResults([
      parseK8sYaml(GATEWAY_AND_VS, "istio/gw-vs.yaml"),
      parseK8sYaml(
        `apiVersion: v1
kind: Service
metadata:
  name: reviews
  namespace: demo
`,
        "svc.yaml",
      ),
    ]);
    const { nodes } = buildFlowGraph(parsed);
    expect(nodes.some((n) => n.type === "ingressController")).toBe(false);
  });

  it("tiered 01+02: global controller → tier-01 Host; tier-02 controller → Ingress; no tier-01 Ingress card", () => {
    const parsed = mergeParseResults([
      parseK8sYaml(INGRESS_01, "01-edge/edge-global.yaml"),
      parseK8sYaml(INGRESS_02, "02-core/core-ingress.yaml"),
    ]);
    const { nodes, edges } = buildFlowGraph(parsed);
    const t2Controllers = nodes.filter(
      (n) => n.type === "ingressController" && n.data?.controllerScope === "tier02",
    );
    expect(t2Controllers).toHaveLength(1);
    const t2 = t2Controllers[0]!;
    expect(t2.id).toContain("ingress-ctrl-t2");

    const globalIc = nodes.find(
      (n) =>
        n.type === "ingressController" &&
        n.data?.globalK8sIngressController === true &&
        n.data?.controllerScope !== "tier02",
    );
    expect(globalIc).toBeTruthy();

    const ingA = nodes.find((n) => n.type === "ingress" && n.data?.label === "edge-global");
    const ingB = nodes.find((n) => n.type === "ingress" && n.data?.label === "core-ingress");
    expect(ingA).toBeUndefined();
    expect(ingB).toBeTruthy();

    const hostA = nodes.find(
      (n) => n.type === "host" && n.parentNode?.includes("edge-global"),
    );
    expect(hostA).toBeTruthy();

    const globalTrunk = edges.find(
      (e) => e.source === globalIc!.id && String(e.target ?? "").includes("junction"),
    );
    expect(globalTrunk).toBeTruthy();
    const globalJunction = globalTrunk!.target;
    expect(edges.filter((e) => e.source === globalJunction && e.target === hostA!.id)).toHaveLength(
      1,
    );

    const t2Trunk = edges.find((e) => e.source === t2.id && String(e.target ?? "").includes("junction"));
    expect(t2Trunk).toBeTruthy();
    const t2Junction = t2Trunk!.target;
    expect(edges.filter((e) => e.source === t2Junction && e.target === ingB!.id)).toHaveLength(1);
  });

  it("uses distinct Ingress controllers per namespace+class when not sharing a key", () => {
    const otherNs = INGRESS_01.replace("namespace: traffic", "namespace: edge");
    const parsed = mergeParseResults([
      parseK8sYaml(INGRESS_01, "a.yaml"),
      parseK8sYaml(otherNs, "b.yaml"),
    ]);
    const { nodes } = buildFlowGraph(parsed);
    const controllers = nodes.filter((n) => n.type === "ingressController");
    expect(controllers).toHaveLength(2);
    const ns = controllers.map((c) => c.data?.namespace).sort();
    expect(ns).toEqual(["edge", "traffic"]);
  });

  it("creates separate controllers for different ingressClassName values", () => {
    const traefikIng = INGRESS_01.replace("ingressClassName: nginx", "ingressClassName: traefik").replace(
      "name: edge-global",
      "name: other-ing",
    );
    const parsed = mergeParseResults([parseK8sYaml(INGRESS_01, "a.yaml"), parseK8sYaml(traefikIng, "b.yaml")]);
    const { nodes } = buildFlowGraph(parsed);
    expect(nodes.filter((n) => n.type === "ingressController")).toHaveLength(2);
  });
});

describe("buildFlowGraph ingress forwarding", () => {
  it("tiered 01→02: data-plane tail connects to tier-02 controller (no tier-01 Ingress Nginx forward)", () => {
    const parsed = mergeParseResults([
      parseK8sYaml(INGRESS_01, "01-edge/edge-global.yaml"),
      parseK8sYaml(INGRESS_02, "02-core/core-ingress.yaml"),
    ]);
    const { nodes, edges } = buildFlowGraph(parsed);

    expect(
      nodes.find((n) => n.type === "ingress" && n.data?.label === "edge-global"),
    ).toBeUndefined();

    const t2 = nodes.find(
      (n) => n.type === "ingressController" && String(n.id).includes("ingress-ctrl-t2"),
    );
    expect(t2).toBeTruthy();

    const nginxFromTier01Ingress = edges.filter((e) => e.label === "Nginx forward");
    expect(nginxFromTier01Ingress).toHaveLength(0);

    const region = nodes.find(
      (n) => n.type === "ingressRegion" && n.data?.ingressName === "edge-global",
    );
    expect(region).toBeTruthy();
    const tails = nodes.filter(
      (n) =>
        (n.type === "service" || n.type === "endpoints") && n.parentNode === region!.id,
    );
    expect(tails.length).toBeGreaterThan(0);
    const rightTail = [...tails].sort((a, b) => {
      const ax = typeof a.position?.x === "number" ? a.position.x : 0;
      const bx = typeof b.position?.x === "number" ? b.position.x : 0;
      if (bx !== ax) return bx - ax;
      const ay = typeof a.position?.y === "number" ? a.position.y : 0;
      const by = typeof b.position?.y === "number" ? b.position.y : 0;
      return by - ay;
    })[0]!;
    const bridge = edges.find(
      (e) =>
        e.source === rightTail.id &&
        e.target === t2!.id &&
        String(e.id ?? "").includes("tier-tail-next"),
    );
    expect(bridge).toBeTruthy();
    expect(bridge?.label).toBeUndefined();
    expect(bridge?.type).toBe("step");

    const portLabelEdge = edges.find(
      (e) => typeof e.label === "string" && e.label.startsWith("→ :"),
    );
    expect(portLabelEdge).toBeTruthy();
    expect(portLabelEdge?.type).toBe("readableLabel");
    expect(portLabelEdge?.data).toMatchObject({ baseType: "smoothstep" });
  });
});

describe("buildFlowGraph ingress forwarding (non-tiered)", () => {
  it("renders only one Nginx forward edge for an overlapping ingress pair", () => {
    const parsed = mergeParseResults([
      parseK8sYaml(INGRESS_01, "edge.yaml"),
      parseK8sYaml(INGRESS_02, "core.yaml"),
    ]);
    const { nodes, edges } = buildFlowGraph(parsed);

    const src = nodes.find((n) => n.type === "ingress" && n.data?.label === "edge-global");
    const dst = nodes.find((n) => n.type === "ingress" && n.data?.label === "core-ingress");
    expect(src).toBeTruthy();
    expect(dst).toBeTruthy();

    const forwards = edges.filter(
      (e) =>
        e.label === "Nginx forward" &&
        ((e.source === src!.id && e.target === dst!.id) ||
          (e.source === dst!.id && e.target === src!.id)),
    );
    expect(forwards).toHaveLength(1);
  });
});

describe("buildFlowGraph Istio global gateway + weighted routes", () => {
  it("merges Istio Gateway globally and labels Route→Service edges with subset and weight", () => {
    const parsed = parseK8sYaml(GATEWAY_AND_VS, "istio.yaml");
    const { nodes, edges } = buildFlowGraph(parsed);

    const globalGw = nodes.find((n) => n.type === "istioGateway" && n.data?.globalGateway === true);
    expect(globalGw).toBeTruthy();

    const vsEntry = nodes.find((n) => n.type === "ingress" && n.data?.label === "vs-app");
    expect(vsEntry).toBeTruthy();

    const junction = nodes.find(
      (n) => n.type === "junction" && n.id.startsWith("istio-gw-junction-"),
    );
    expect(junction).toBeTruthy();
    const gwToJunction = edges.find(
      (e) => e.source === globalGw!.id && e.target === junction!.id && e.label === "Gateway",
    );
    expect(gwToJunction).toBeTruthy();
    const branchToVs = edges.find((e) => e.source === junction!.id && e.target === vsEntry!.id);
    expect(branchToVs).toBeTruthy();

    const destNodes = nodes.filter((n) => n.type === "istioDestination");
    expect(destNodes).toHaveLength(2);
    expect(
      edges.some(
        (e) => typeof e.label === "string" && e.label === "w=70" && e.source.includes("route-"),
      ),
    ).toBe(true);
    expect(
      edges.some(
        (e) => typeof e.label === "string" && e.label === "w=30" && e.source.includes("route-"),
      ),
    ).toBe(true);
    const greenEdge = edges.find(
      (e) =>
        typeof e.label === "string" &&
        e.label.includes("subset=green") &&
        e.source.includes("vsdest-"),
    );
    expect(greenEdge).toBeTruthy();
  });
});

describe("buildFlowGraph edge dedupe", () => {
  it("does not create duplicate Gateway→VirtualService edges when gateways refs normalize to same name", () => {
    const withDupRef = GATEWAY_AND_VS.replace(
      "  gateways:\n    - istio-system/rts-istio-ingress-gateway\n",
      "  gateways:\n    - istio-system/rts-istio-ingress-gateway\n    - rts-istio-ingress-gateway\n",
    );
    const parsed = parseK8sYaml(withDupRef, "istio-dup.yaml");
    const { nodes, edges } = buildFlowGraph(parsed);

    const globalGw = nodes.find((n) => n.type === "istioGateway" && n.data?.globalGateway === true);
    const vsEntry = nodes.find((n) => n.type === "ingress" && n.data?.label === "vs-app");
    expect(globalGw).toBeTruthy();
    expect(vsEntry).toBeTruthy();

    const gwEdges = edges.filter((e) => e.source === globalGw!.id && e.label === "Gateway");
    expect(gwEdges).toHaveLength(1);
  });
});

describe("buildFlowGraph parallel Route→Service edges", () => {
  it("fans out overlapping edges with symmetric step offsets (via Destination→Service fan-in)", () => {
    const parsed = parseK8sYaml(VS_SAME_SVC_WEIGHTED, "istio/same-svc.yaml");
    const { nodes, edges } = buildFlowGraph(parsed);

    expect(nodes.filter((n) => n.type === "istioDestination")).toHaveLength(2);
    expect(edges.some((e) => e.label === "w=80" && e.source.startsWith("route-"))).toBe(true);
    expect(edges.some((e) => e.label === "w=20" && e.source.startsWith("route-"))).toBe(true);

    const parallel = edges.filter(
      (e) =>
        e.source.startsWith("vsdest-") &&
        e.type === "readableLabel" &&
        (e.data as { baseType?: string })?.baseType === "step",
    );
    expect(parallel).toHaveLength(2);
    const offsets = parallel
      .map((e) => (e.pathOptions as { offset?: number } | undefined)?.offset)
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b);
    expect(offsets).toEqual([-7, 7]);

    const svcId = parallel[0]!.target;
    expect(nodes.find((n) => n.id === svcId)?.type).toBe("service");
  });
});

const VS_B = `apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vs-b
  namespace: demo
spec:
  gateways:
    - istio-system/rts-istio-ingress-gateway
  hosts:
    - other.example.com
  http:
    - match:
        - uri:
            prefix: /api
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            port:
              number: 9080
`;

const LAYOUT_EST_ISTIO_GW_H = 136;

describe("buildFlowGraph VirtualService column + gateway vertical center", () => {
  it("stacks two VirtualService regions in the same x and centers global gateway", () => {
    const p1 = parseK8sYaml(GATEWAY_AND_VS, "03-dce5-active01-istio/vs-app.yaml");
    const p2 = parseK8sYaml(VS_B, "03-dce5-active01-istio/vs-b.yaml");
    const parsed = mergeParseResults([p1, p2]);
    const { nodes, edges } = buildFlowGraph(parsed);

    const regA = nodes.find((n) => n.type === "ingressRegion" && n.data?.ingressName === "vs-app");
    const regB = nodes.find((n) => n.type === "ingressRegion" && n.data?.ingressName === "vs-b");
    const globalGw = nodes.find((n) => n.type === "istioGateway" && n.data?.globalGateway === true);

    expect(regA).toBeTruthy();
    expect(regB).toBeTruthy();
    expect(globalGw).toBeTruthy();
    expect(regA!.position?.x).toBe(regB!.position?.x);
    expect(regA!.position?.y ?? 0).toBeLessThan(regB!.position?.y ?? 0);

    const hA = Number((regA!.style as { height?: number })?.height ?? 0);
    const hB = Number((regB!.style as { height?: number })?.height ?? 0);
    const midY = (regA!.position!.y + hA / 2 + regB!.position!.y + hB / 2) / 2;
    const gwCenterY = (globalGw!.position?.y ?? 0) + LAYOUT_EST_ISTIO_GW_H / 2;
    expect(Math.abs(gwCenterY - midY)).toBeLessThan(1.5);

    // Aggregated wiring: 1 trunk (gw->junction) + 2 branch edges (junction->vs)
    const junction = nodes.find(
      (n) => n.type === "junction" && n.id.startsWith("istio-gw-junction-"),
    );
    expect(junction).toBeTruthy();
    expect(edges.filter((e) => e.source === globalGw!.id && e.label === "Gateway").length).toBe(1);
    expect(edges.filter((e) => e.source === junction!.id).length).toBe(2);
  });

  it("dedupes identical VirtualService host+path routes into a single Route node", () => {
    const VS_DUP = `apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vs-dup
  namespace: demo
spec:
  gateways:
    - istio-system/rts-istio-ingress-gateway
  hosts:
    - app.example.com
  http:
    - match:
        - uri:
            prefix: /api
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            subset: blue
            port:
              number: 9080
          weight: 50
    - match:
        - uri:
            prefix: /api
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            subset: green
            port:
              number: 9080
          weight: 50
`;
    const parsed = parseK8sYaml(VS_DUP, "istio/vs-dup.yaml");
    const { nodes, edges } = buildFlowGraph(parsed);

    const routeNodes = nodes.filter(
      (n) =>
        n.type === "route" && n.data?.ingressKind === "VirtualService" && n.data?.path === "/api",
    );
    expect(routeNodes).toHaveLength(1);
    expect(routeNodes[0]?.data?.istioDestinations ?? []).toHaveLength(0);
    expect(nodes.filter((n) => n.type === "istioDestination")).toHaveLength(2);
    const routeId = routeNodes[0]!.id as string;
    expect(edges.filter((e) => e.source === routeId && e.label === "w=50")).toHaveLength(2);
  });

  it("does NOT dedupe VirtualService routes that differ by queryParams or name", () => {
    const VS_QP = `apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vs-qp
  namespace: demo
spec:
  gateways:
    - istio-system/rts-istio-ingress-gateway
  hosts:
    - api.example.com
  http:
    - name: WTCHK
      match:
        - queryParams:
            buCode:
              exact: WTCHK
          uri:
            prefix: /rts/physical/v2.1.0/stock/enquire_product
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            port:
              number: 9080
          weight: 80
    - name: FTRHK
      match:
        - queryParams:
            buCode:
              exact: FTRHK
          uri:
            prefix: /rts/physical/v2.1.0/stock/enquire_product
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            port:
              number: 9080
          weight: 20
`;
    const parsed = parseK8sYaml(VS_QP, "istio/vs-qp.yaml");
    const { nodes } = buildFlowGraph(parsed);
    const routeNodes = nodes.filter(
      (n) =>
        n.type === "route" &&
        n.data?.ingressKind === "VirtualService" &&
        n.data?.path === "/rts/physical/v2.1.0/stock/enquire_product",
    );
    expect(routeNodes).toHaveLength(2);
    expect(new Set(routeNodes.map((n) => n.data?.istioRouteName))).toEqual(
      new Set(["WTCHK", "FTRHK"]),
    );
  });
});
