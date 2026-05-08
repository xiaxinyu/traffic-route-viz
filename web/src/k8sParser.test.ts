import { describe, expect, it } from "vitest";

import { parseK8sYaml } from "./k8sParser";

const VS_WEIGHTED = `apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vs-demo
  namespace: demo
spec:
  gateways:
    - istio-system/rts-istio-ingress-gateway
  hosts:
    - api.example.com
  http:
    - match:
        - uri:
            prefix: /v1
      route:
        - destination:
            host: reviews.demo.svc.cluster.local
            subset: blue
            port:
              number: 9080
          weight: 80
        - destination:
            host: ratings.demo.svc.cluster.local
            subset: green
            port:
              number: 9080
          weight: 20
`;

describe("parseK8sYaml VirtualService", () => {
  it("captures all route destinations with subset and weight", () => {
    const r = parseK8sYaml(VS_WEIGHTED, "vs.yaml");
    const routes = r.routes.filter((x) => x.ingressName === "vs-demo");
    expect(routes.length).toBeGreaterThan(0);
    const first = routes[0]!;
    expect(first.istioDestinations).toHaveLength(2);
    expect(first.istioDestinations?.[0]).toMatchObject({
      subset: "blue",
      weight: 80,
    });
    expect(first.istioDestinations?.[1]).toMatchObject({
      subset: "green",
      weight: 20,
    });
  });

  it("captures match queryParams + headers.request.set + http route name", () => {
    const VS_MATCH = `apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vs-match
  namespace: demo
spec:
  gateways:
    - istio-system/rts-istio-ingress-gateway
  hosts:
    - api.example.com
  http:
    - name: WTCHK
      headers:
        request:
          set:
            x-app-version: v1.0.0
            x-group-id: rts-mbhk
      match:
        - queryParams:
            buCode:
              exact: WTCHK
          uri:
            prefix: /rts/physical/v2.1.0/stock/enquire_product
      route:
        - destination:
            host: physical-stock-service-api-mbhk.demo.svc.cluster.local
            port:
              number: 9001
            subset: blue
          weight: 80
        - destination:
            host: physical-stock-service-api-mbhk.demo.svc.cluster.local
            port:
              number: 9001
            subset: green
          weight: 20
`;
    const r = parseK8sYaml(VS_MATCH, "vs-match.yaml");
    const routes = r.routes.filter((x) => x.ingressName === "vs-match");
    expect(routes.length).toBeGreaterThan(0);
    const first = routes[0]!;
    expect(first.istioRouteName).toBe("WTCHK");
    expect(first.istioQueryParams).toEqual([{ key: "buCode", op: "exact", value: "WTCHK" }]);
    expect(first.istioRequestHeadersSet).toMatchObject({
      "x-app-version": "v1.0.0",
      "x-group-id": "rts-mbhk",
    });
  });
});
