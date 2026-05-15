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

describe("buildFlowGraph ingress forwarding", () => {
  it("creates tier-forward ingress->ingress edge for overlapping nginx routes", () => {
    const parsed = mergeParseResults([
      parseK8sYaml(INGRESS_01, "01-edge/edge-global.yaml"),
      parseK8sYaml(INGRESS_02, "02-core/core-ingress.yaml"),
    ]);
    const { nodes, edges } = buildFlowGraph(parsed);

    const src = nodes.find((n) => n.type === "ingress" && n.data?.label === "edge-global");
    const dst = nodes.find((n) => n.type === "ingress" && n.data?.label === "core-ingress");
    expect(src).toBeTruthy();
    expect(dst).toBeTruthy();

    const forwarding = edges.find(
      (e) => e.label === "Nginx forward" && e.source === src!.id && e.target === dst!.id,
    );
    expect(forwarding).toBeTruthy();
    expect(forwarding?.style).toMatchObject({ stroke: "#6366f1" });
    expect(forwarding?.type).toBe("readableLabel");
    expect(forwarding?.data).toMatchObject({ baseType: "step" });

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
