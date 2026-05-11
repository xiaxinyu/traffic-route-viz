/** Demo: show 2 ingresses + TLS + LB + one endpoints */
export const SAMPLE_YAML = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rbac-authorization
  namespace: rbac-aswatson-prd
spec:
  ingressClassName: nginx
  rules:
    - host: auth2-api.hk.aswatson.net
      http:
        paths:
          - path: /
            pathType: ImplementationSpecific
            backend:
              service:
                name: rbac-login-frontend
                port:
                  number: 80
          - path: /authorization_code
            pathType: ImplementationSpecific
            backend:
              service:
                name: rbac-authorization
                port:
                  number: 8080
          - path: /api
            pathType: ImplementationSpecific
            backend:
              service:
                name: envoy-rbac-gateway-gtw
                port:
                  number: 30001
status:
  loadBalancer:
    ingress:
      - ip: 10.24.205.230
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rbac-global-ingress
  namespace: ingress-nginx
spec:
  ingressClassName: nginx
  rules:
    - host: auth2-api.hk.aswatson.net
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: rbac-global-service
                port:
                  number: 80
    - host: api.apac.aswatson.net
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: rbac-global-service
                port:
                  number: 80
  tls:
    - hosts:
        - auth2-api.hk.aswatson.net
      secretName: auth2-api.hk.aswatson.net.20260119
status:
  loadBalancer:
    ingress:
      - ip: 10.32.57.30
---
apiVersion: v1
kind: Service
metadata:
  name: rbac-global-service
  namespace: ingress-nginx
spec:
  type: ClusterIP
  clusterIP: None
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: Endpoints
metadata:
  name: rbac-global-service
  namespace: ingress-nginx
subsets:
  - addresses:
      - ip: 10.32.56.252
    ports:
      - port: 80
      protocol: TCP
`;
