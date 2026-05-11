import { describe, expect, it } from "vitest";

import { parseK8sYaml } from "../../domain/k8sParser";
import { buildIndexedDocCorpus } from "./routeMergeRawDocs";
import { analyzeRouteMerge } from "./routeMergeRecommend";

const TWO_INGRESS = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ing-a
  namespace: demo
spec:
  ingressClassName: nginx
  rules:
  - host: foo.example
    http:
      paths:
      - path: /a
        pathType: Prefix
        backend:
          service:
            name: svc-a
            port:
              number: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ing-b
  namespace: demo
spec:
  ingressClassName: nginx
  rules:
  - host: foo.example
    http:
      paths:
      - path: /b
        pathType: Prefix
        backend:
          service:
            name: svc-b
            port:
              number: 80
`;

const CONFLICT_INGRESS = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ing-a
  namespace: demo
spec:
  ingressClassName: nginx
  rules:
  - host: foo.example
    http:
      paths:
      - path: /x
        pathType: Prefix
        backend:
          service:
            name: svc-a
            port:
              number: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ing-b
  namespace: demo
spec:
  ingressClassName: nginx
  rules:
  - host: foo.example
    http:
      paths:
      - path: /x
        pathType: Prefix
        backend:
          service:
            name: svc-other
            port:
              number: 80
`;

describe("analyzeRouteMerge", () => {
  it("produces safe Ingress merge for disjoint paths on same host", () => {
    const pr = parseK8sYaml(TWO_INGRESS);
    const idx = buildIndexedDocCorpus(TWO_INGRESS, null);
    const { recommendations } = analyzeRouteMerge(pr, idx);
    const safe = recommendations.find((r) => r.level === "safe" && r.kind === "Ingress");
    expect(safe).toBeTruthy();
    expect(safe?.candidateYaml).toContain("ing-a-merged-candidate");
    expect(safe?.candidateYaml).toContain("/a");
    expect(safe?.candidateYaml).toContain("/b");
  });

  it("blocks Ingress when same path targets different services", () => {
    const pr = parseK8sYaml(CONFLICT_INGRESS);
    const idx = buildIndexedDocCorpus(CONFLICT_INGRESS, null);
    const { recommendations } = analyzeRouteMerge(pr, idx);
    const blocked = recommendations.find((r) => r.level === "blocked" && r.kind === "Ingress");
    expect(blocked).toBeTruthy();
    expect(blocked?.candidateYaml).toBeUndefined();
  });
});
