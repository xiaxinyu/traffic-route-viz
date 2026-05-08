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
  });
});
