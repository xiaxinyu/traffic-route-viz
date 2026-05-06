import { useCallback, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";

import { buildFlowGraph } from "./buildGraph";
import { parseK8sYaml, type ParseResult } from "./k8sParser";
import {
  EndpointsNode,
  HostNode,
  IngressNode,
  IngressRegionNode,
  RouteNode,
  ServiceNode,
} from "./FlowNodes";

const nodeTypes = {
  ingressRegion: IngressRegionNode,
  ingress: IngressNode,
  host: HostNode,
  route: RouteNode,
  service: ServiceNode,
  endpoints: EndpointsNode,
};

/** Demo: show 2 ingresses + TLS + LB + one endpoints */
const SAMPLE = `apiVersion: networking.k8s.io/v1
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

type ImportedFile = { name: string; text: string };

async function readFiles(files: FileList): Promise<ImportedFile[]> {
  const out: ImportedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    out.push({ name: f.name, text: await f.text() });
  }
  return out;
}

function mergeYamlFiles(files: ImportedFile[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0]!.text;
  return files.map((f) => f.text).join("\n---\n");
}

function mergeParseResults(results: ParseResult[]): ParseResult {
  const errors: string[] = [];

  const ingressByKey = new Map<string, ParseResult["ingresses"][number]>();
  const routes: ParseResult["routes"] = [];

  const svcByKey = new Map<string, ParseResult["services"][number]>();
  const epByKey = new Map<string, ParseResult["endpoints"][number]>();

  const key = (ns: string | undefined, name: string) => (ns ? `${ns}/${name}` : name);

  for (const r of results) {
    errors.push(...r.errors);
    for (const ing of r.ingresses) {
      const k = key(ing.namespace, ing.name);
      const prev = ingressByKey.get(k);
      if (!prev) {
        ingressByKey.set(k, ing);
      } else {
        // Merge fields similarly to parser behavior.
        const tlsKey = (t: { secretName?: string; hosts: string[] }) =>
          `${t.secretName ?? ""}|${t.hosts.join(",")}`;
        const tlsSeen = new Set(prev.tls.map(tlsKey));
        const tls = [...prev.tls];
        for (const t of ing.tls) {
          const tk = tlsKey(t);
          if (!tlsSeen.has(tk)) {
            tlsSeen.add(tk);
            tls.push(t);
          }
        }
        const loadBalancerIps = [...new Set([...prev.loadBalancerIps, ...ing.loadBalancerIps])];
        const sourceFiles = [...new Set([...(prev.sourceFiles ?? []), ...(ing.sourceFiles ?? [])])];
        ingressByKey.set(k, {
          name: prev.name,
          namespace: prev.namespace ?? ing.namespace,
          className: prev.className ?? ing.className,
          tls,
          loadBalancerIps,
          sourceFiles,
        });
      }
    }

    routes.push(...r.routes);

    for (const s of r.services) {
      const prev = svcByKey.get(s.key);
      if (!prev) {
        svcByKey.set(s.key, s);
      } else {
        svcByKey.set(s.key, {
          ...prev,
          type: prev.type ?? s.type,
          clusterIP: prev.clusterIP ?? s.clusterIP,
          ports: prev.ports.length ? prev.ports : s.ports,
          sourceFiles: [...new Set([...(prev.sourceFiles ?? []), ...(s.sourceFiles ?? [])])],
        });
      }
    }

    for (const e of r.endpoints) {
      const prev = epByKey.get(e.key);
      if (!prev) {
        epByKey.set(e.key, e);
      } else {
        epByKey.set(e.key, {
          ...prev,
          addresses: [...new Set([...prev.addresses, ...e.addresses])],
          ports: prev.ports.length ? prev.ports : e.ports,
          sourceFiles: [...new Set([...(prev.sourceFiles ?? []), ...(e.sourceFiles ?? [])])],
        });
      }
    }
  }

  return {
    ingresses: [...ingressByKey.values()],
    routes,
    services: [...svcByKey.values()],
    endpoints: [...epByKey.values()],
    errors,
  };
}

function AppInner() {
  const [yamlText, setYamlText] = useState(SAMPLE);
  const [parsedMsg, setParsedMsg] = useState<string | null>(null);
  const [importedFiles, setImportedFiles] = useState<ImportedFile[] | null>(null);
  // null means "merged view"; otherwise index into importedFiles
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const p = parseK8sYaml(SAMPLE);
    return buildFlowGraph(p);
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  const applyYaml = useCallback(
    (overrideText?: string) => {
      const src = overrideText ?? yamlText;
      const p = importedFiles?.length
        ? mergeParseResults(
            importedFiles.map((f) => parseK8sYaml(f.text, f.name)),
          )
        : parseK8sYaml(src);
    const err = p.errors.length ? p.errors.join("\n") : null;
    setParsedMsg(err);
    const { nodes: n, edges: e } = buildFlowGraph(p);
    setNodes(n);
    setEdges(e);
    },
    [yamlText, importedFiles, setNodes, setEdges],
  );

  const mergedImportedText = useMemo(() => {
    return importedFiles ? mergeYamlFiles(importedFiles) : null;
  }, [importedFiles]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          flexShrink: 0,
          padding: "12px 16px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <strong style={{ color: "#0f172a" }}>
          Ingress → Host → Service → Endpoints
        </strong>
        <button
          type="button"
          onClick={() => applyYaml(mergedImportedText ?? yamlText)}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "#4f46e5",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          解析并刷新图表
        </button>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          画布: Ingress→Host→Route→Service→Endpoints；紫底分区与卡片均可拖拽（卡片限分区内）。
        </span>
      </header>
      {parsedMsg ? (
        <div
          style={{
            padding: "8px 16px",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          解析告警: {parsedMsg}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <aside
          style={{
            width: 420,
            flexShrink: 0,
            borderRight: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 800 }}>YAML 输入</div>
              {importedFiles?.length ? (
                <div style={{ fontSize: 11, color: "#64748b", textAlign: "right" }}>
                  已导入 {importedFiles.length} 个文件
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#64748b" }}>未导入文件</div>
              )}
            </div>

            <div
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={async (ev) => {
                ev.preventDefault();
                const list = ev.dataTransfer.files;
                if (!list?.length) return;
                const files = await readFiles(list);
                setImportedFiles(files);
                setActiveFileIndex(null);
                const merged = mergeYamlFiles(files);
                setYamlText(merged);
                applyYaml(merged);
              }}
              style={{
                marginTop: 10,
                padding: "12px 12px",
                borderRadius: 12,
                border: "1.5px dashed rgba(79,70,229,0.35)",
                background: "#f5f3ff",
                color: "#3730a3",
                fontSize: 12,
                cursor: "pointer",
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              拖拽多个 `.yaml/.yml` 文件到这里，或点击选择
              <div style={{ fontSize: 11, color: "#6d28d9", marginTop: 6 }}>
                多文件会以 <code>---</code> 合并解析
              </div>
              {importedFiles?.length ? (
                <div style={{ fontSize: 11, color: "#5b21b6", marginTop: 6 }}>
                  {importedFiles.slice(0, 3).map((f) => f.name).join(", ")}
                  {importedFiles.length > 3 ? `...(+${importedFiles.length - 3})` : ""}
                </div>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml,.YAML,.YML,text/plain,text/yaml"
              multiple
              style={{ display: "none" }}
              onChange={async (ev) => {
                const list = ev.target.files;
                if (!list?.length) return;
                const files = await readFiles(list);
                setImportedFiles(files);
                setActiveFileIndex(null);
                const merged = mergeYamlFiles(files);
                setYamlText(merged);
                ev.target.value = "";
                applyYaml(merged);
              }}
            />

            {importedFiles?.length ? (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFileIndex(null);
                      const merged = mergeYamlFiles(importedFiles);
                      setYamlText(merged);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid " + (activeFileIndex === null ? "#4f46e5" : "#e2e8f0"),
                      background: activeFileIndex === null ? "#eef2ff" : "#fff",
                      color: activeFileIndex === null ? "#3730a3" : "#334155",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                    title="查看合并后的内容（解析也以合并为准）"
                  >
                    合并视图（{importedFiles.length}）
                  </button>
                  {importedFiles.map((f, idx) => {
                    const active = activeFileIndex === idx;
                    return (
                      <button
                        key={f.name + idx}
                        type="button"
                        onClick={() => {
                          setActiveFileIndex(idx);
                          setYamlText(f.text);
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid " + (active ? "#7c3aed" : "#e2e8f0"),
                          background: active ? "#f5f3ff" : "#fff",
                          color: active ? "#6d28d9" : "#334155",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          maxWidth: 240,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={f.name}
                      >
                        {f.name}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
                  当前仅切换左侧内容；图表解析默认按“合并视图”进行（点上方按钮或导入时会刷新）。
                </div>
              </div>
            ) : null}
          </div>
          <textarea
            value={yamlText}
            onChange={(e) => {
              const next = e.target.value;
              setYamlText(next);
              // If user is editing a specific imported file tab, keep it in sync so merged parse is correct.
              if (importedFiles && activeFileIndex !== null) {
                setImportedFiles((prev) => {
                  if (!prev) return prev;
                  if (activeFileIndex < 0 || activeFileIndex >= prev.length) return prev;
                  const copy = [...prev];
                  copy[activeFileIndex] = { ...copy[activeFileIndex]!, text: next };
                  return copy;
                });
              }
              // If editing merged view while imported files exist, we treat textarea as the merged source of truth.
            }}
            spellCheck={false}
            style={{
              flex: 1,
              minHeight: 200,
              width: "100%",
              padding: 12,
              border: "none",
              resize: "none",
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              fontSize: 12,
              lineHeight: 1.45,
              outline: "none",
            }}
          />
        </aside>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={1.8}
          >
            <Background gap={14} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={2}
              maskColor="rgba(15,23,42,0.08)"
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}
