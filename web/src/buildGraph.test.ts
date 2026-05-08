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
      (e) => e.label === "Nginx 转发" && e.source === src!.id && e.target === dst!.id,
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

describe("buildFlowGraph Istio global gateway + weighted routes", () => {
  it("merges Istio Gateway globally and labels Route→Service edges with subset and weight", () => {
    const parsed = parseK8sYaml(GATEWAY_AND_VS, "istio.yaml");
    const { nodes, edges } = buildFlowGraph(parsed);

    const globalGw = nodes.find((n) => n.type === "istioGateway" && n.data?.globalGateway === true);
    expect(globalGw).toBeTruthy();

    const vsEntry = nodes.find((n) => n.type === "ingress" && n.data?.label === "vs-app");
    expect(vsEntry).toBeTruthy();

    const gwToVs = edges.find(
      (e) => e.source === globalGw!.id && e.target === vsEntry!.id && e.label === "Gateway",
    );
    expect(gwToVs).toBeTruthy();

    const weighted = edges.filter(
      (e) =>
        typeof e.label === "string" && e.label.includes("subset=blue") && e.label.includes("w=70"),
    );
    expect(weighted.length).toBeGreaterThanOrEqual(1);
    const greenEdge = edges.find(
      (e) =>
        typeof e.label === "string" && e.label.includes("subset=green") && e.label.includes("w=30"),
    );
    expect(greenEdge).toBeTruthy();
  });
});
