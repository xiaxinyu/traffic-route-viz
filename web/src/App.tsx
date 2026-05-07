import { useCallback, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeChange,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";

import { AuthGate, clearSession } from "./AuthGate";
import { DiagramActions } from "./DiagramActions";
import { buildFlowGraph } from "./buildGraph";
import {
  manualEdgeFromConnection,
  mergeComputedEdgesKeepingManual,
  reconnectEdgeAsManual,
} from "./diagramPersist";
import {
  mergeParseResults,
  mergeYamlFiles,
  readImportedYamlFiles,
  type ImportedYamlFile,
} from "./mergeYamlBundles";
import { parseK8sYaml } from "./k8sParser";
import {
  DestinationRuleNode,
  EndpointsNode,
  HostNode,
  HttpProxyNode,
  IngressNode,
  IngressRegionNode,
  IstioGatewayNode,
  RouteNode,
  ServiceNode,
} from "./FlowNodes";
import { getRuntimeConfig } from "./runtimeConfig";

const nodeTypes = {
  ingressRegion: IngressRegionNode,
  ingress: IngressNode,
  istioGateway: IstioGatewayNode,
  destinationRule: DestinationRuleNode,
  host: HostNode,
  httpProxy: HttpProxyNode,
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

function AppInner() {
  const [yamlText, setYamlText] = useState(SAMPLE);
  const [parsedMsg, setParsedMsg] = useState<string | null>(null);
  const [importedFiles, setImportedFiles] = useState<ImportedYamlFile[] | null>(null);
  // null means "merged view"; otherwise index into importedFiles
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const [leftMode, setLeftMode] = useState<"files" | "yaml">("files");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const p = parseK8sYaml(SAMPLE);
    return buildFlowGraph(p);
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) => {
        if (!c.source || !c.target) return eds;
        const sameManualExists = eds.some(
          (e) =>
            e.data?.manual === true &&
            e.source === c.source &&
            e.target === c.target &&
            (e.sourceHandle ?? null) === (c.sourceHandle ?? null) &&
            (e.targetHandle ?? null) === (c.targetHandle ?? null),
        );
        if (sameManualExists) return eds;
        return [...eds, manualEdgeFromConnection(c)];
      }),
    [setEdges],
  );
  const onReconnect = useCallback(
    (oldEdge: Edge, c: Connection) => setEdges((eds) => reconnectEdgeAsManual(oldEdge, c, eds)),
    [setEdges],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const applyYaml = useCallback(
    (overrideText?: string, importedFilesOverride?: ImportedYamlFile[] | null) => {
      const src = overrideText ?? yamlText;
      const effectiveFiles = importedFilesOverride ?? importedFiles;
      const p = effectiveFiles?.length
        ? mergeParseResults(effectiveFiles.map((f) => parseK8sYaml(f.text, f.relPath ?? f.name)))
        : parseK8sYaml(src);
      const err = p.errors.length ? p.errors.join("\n") : null;
      setParsedMsg(err);
      const { nodes: n, edges: e } = buildFlowGraph(p);
      const ids = new Set(n.map((x) => x.id));
      setNodes(n);
      setEdges((prev) => mergeComputedEdgesKeepingManual(prev, e, ids));
    },
    [yamlText, importedFiles, setNodes, setEdges, setParsedMsg],
  );

  const mergedImportedText = useMemo(() => {
    return importedFiles ? mergeYamlFiles(importedFiles) : null;
  }, [importedFiles]);

  const displayPath = useCallback((f: ImportedYamlFile) => f.relPath ?? f.name, []);
  const displayFolderHint = useCallback((p: string) => {
    // remove "01/02/03" numeric prefix from segments like "01-foo-bar"
    return p
      .split("/")
      .filter(Boolean)
      .slice(0, -1)
      .map((seg) => seg.replace(/^(0[1-3])[-_]/, ""))
      .join(" / ");
  }, []);

  const readDroppedFiles = useCallback(async (dt: DataTransfer): Promise<ImportedYamlFile[]> => {
    const items = Array.from(dt.items ?? []);
    const hasEntryApi = items.some((it) => typeof (it as any).webkitGetAsEntry === "function");
    if (!hasEntryApi) {
      // Fallback: plain file drop (no folder structure)
      return await readImportedYamlFiles(dt.files);
    }

    type Entry = {
      isFile: boolean;
      isDirectory: boolean;
      fullPath?: string;
      name: string;
      file?: (cb: (f: File) => void) => void;
      createReader?: () => { readEntries: (cb: (entries: Entry[]) => void) => void };
    };

    const out: ImportedYamlFile[] = [];
    const visit = async (entry: Entry): Promise<void> => {
      if (entry.isFile && entry.file) {
        const file = await new Promise<File>((resolve) => entry.file!(resolve));
        const name = file.name;
        const relPath =
          typeof entry.fullPath === "string"
            ? entry.fullPath.replace(/^\//, "")
            : (file as any).webkitRelativePath || undefined;
        if (!/\.(ya?ml)$/i.test(name)) return;
        out.push({ name, relPath, text: await file.text() });
        return;
      }

      if (entry.isDirectory && entry.createReader) {
        const reader = entry.createReader();
        const readAll = async (): Promise<void> => {
          const batch = await new Promise<Entry[]>((resolve) => reader.readEntries(resolve));
          if (!batch.length) return;
          for (const child of batch) await visit(child);
          await readAll();
        };
        await readAll();
      }
    };

    for (const it of items) {
      const e = (it as any).webkitGetAsEntry?.() as Entry | undefined;
      if (e) await visit(e);
    }
    return out;
  }, []);

  const mergeImportedFiles = useCallback(
    (prev: ImportedYamlFile[] | null, next: ImportedYamlFile[]): ImportedYamlFile[] => {
      const keyOf = (f: ImportedYamlFile) => f.relPath ?? f.name;
      const m = new Map<string, ImportedYamlFile>();
      for (const f of prev ?? []) m.set(keyOf(f), f);
      for (const f of next) m.set(keyOf(f), f); // next wins (refresh/overwrite)
      return [...m.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    },
    [],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          flexShrink: 0,
          padding: "10px 14px",
          borderBottom: "1px solid #e2e8f0",
          background: "rgba(248,250,252,0.92)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: "#0f172a", fontSize: 14 }}>Traffic Route Viz</strong>
            <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
              通用 Traffic 拓扑可视化（Kubernetes / Istio / Contour）
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            Entry → Host → Route → Service → Endpoints
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {getRuntimeConfig().auth?.enabled !== false ? (
            <button
              type="button"
              onClick={() => {
                clearSession();
                window.location.reload();
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#334155",
                fontWeight: 800,
                cursor: "pointer",
              }}
              title="退出登录"
            >
              退出
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => applyYaml(mergedImportedText ?? yamlText)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(15,23,42,0.12)",
            }}
            title="重新解析 YAML 并刷新拓扑"
          >
            刷新拓扑
          </button>
        </div>
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
            width: 380,
            flexShrink: 0,
            borderRight: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 900 }}>输入</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {importedFiles?.length
                    ? `已导入 ${importedFiles.length} 个文件`
                    : "可直接粘贴 YAML 或导入文件/文件夹"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setLeftMode("files")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid " + (leftMode === "files" ? "#4f46e5" : "#e2e8f0"),
                    background: leftMode === "files" ? "#eef2ff" : "#fff",
                    color: leftMode === "files" ? "#3730a3" : "#334155",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                  title="查看已导入文件列表"
                >
                  文件
                </button>
                <button
                  type="button"
                  onClick={() => setLeftMode("yaml")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid " + (leftMode === "yaml" ? "#4f46e5" : "#e2e8f0"),
                    background: leftMode === "yaml" ? "#eef2ff" : "#fff",
                    color: leftMode === "yaml" ? "#3730a3" : "#334155",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                  title="查看/编辑 YAML 文本"
                >
                  YAML
                </button>
              </div>
            </div>

            <div
              data-testid="import-dropzone"
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={async (ev) => {
                ev.preventDefault();
                const incoming = await readDroppedFiles(ev.dataTransfer);
                if (!incoming?.length) return;
                const combined = mergeImportedFiles(importedFiles, incoming);
                setImportedFiles(combined);
                setActiveFileIndex(null);
                setLeftMode("files");
                const merged = mergeYamlFiles(combined);
                setYamlText(merged);
                applyYaml(merged, combined);
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
              <div style={{ fontWeight: 900 }}>导入 YAML 文件 / 文件夹</div>
              <div style={{ fontSize: 11, color: "#6d28d9", marginTop: 6, lineHeight: 1.35 }}>
                支持多选文件夹（追加导入、按相对路径去重），多文件会用 <code>---</code> 合并解析
              </div>
              {importedFiles?.length ? (
                <div style={{ fontSize: 11, color: "#5b21b6", marginTop: 6 }}>
                  {importedFiles
                    .slice(0, 3)
                    .map((f) => displayPath(f))
                    .join(", ")}
                  {importedFiles.length > 3 ? `...(+${importedFiles.length - 3})` : ""}
                </div>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml,.YAML,.YML,text/plain,text/yaml"
              multiple
              {...({ webkitdirectory: "", directory: "" } as unknown as Record<string, string>)}
              style={{ display: "none" }}
              onChange={async (ev) => {
                const list = ev.target.files;
                if (!list?.length) return;
                const incoming = await readImportedYamlFiles(list);
                const combined = mergeImportedFiles(importedFiles, incoming);
                setImportedFiles(combined);
                setActiveFileIndex(null);
                setLeftMode("files");
                const merged = mergeYamlFiles(combined);
                setYamlText(merged);
                ev.target.value = "";
                applyYaml(merged, combined);
              }}
            />

            {importedFiles?.length ? (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveFileIndex(null);
                    const merged = mergeYamlFiles(importedFiles);
                    setYamlText(merged);
                    setLeftMode("yaml");
                  }}
                  style={{
                    padding: "7px 10px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#334155",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                    flex: 1,
                  }}
                  title="图表解析默认按合并视图；这里可快速切换到合并后的 YAML"
                >
                  查看合并 YAML
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportedFiles(null);
                    setActiveFileIndex(null);
                    setYamlText(SAMPLE);
                    setParsedMsg(null);
                    setLeftMode("yaml");
                    applyYaml(SAMPLE, null);
                  }}
                  style={{
                    padding: "7px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(239,68,68,0.25)",
                    background: "rgba(254,242,242,0.9)",
                    color: "#b91c1c",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                  title="清空导入并恢复示例"
                >
                  清空
                </button>
              </div>
            ) : null}
          </div>
          {leftMode === "files" ? (
            <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
              {importedFiles?.length ? (
                <div
                  style={{
                    height: "100%",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>文件列表</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      点击仅切换左侧内容；图表以“合并视图”解析
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#fff" }}>
                    {importedFiles.map((f, idx) => {
                      const active = activeFileIndex === idx;
                      const p = displayPath(f);
                      const folderHint = f.relPath ? displayFolderHint(f.relPath) : "";
                      return (
                        <div
                          key={p + idx}
                          onClick={() => {
                            setActiveFileIndex(idx);
                            setYamlText(f.text);
                            setLeftMode("yaml");
                          }}
                          role="button"
                          tabIndex={0}
                          title={p}
                          style={{
                            padding: "10px 10px",
                            borderBottom: "1px solid #f1f5f9",
                            cursor: "pointer",
                            background: active ? "#eef2ff" : "#fff",
                            display: "flex",
                            alignItems: "baseline",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: active ? "#4f46e5" : "#cbd5e1",
                              flexShrink: 0,
                              marginTop: 4,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                color: "#0f172a",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 320,
                              }}
                            >
                              {f.name}
                            </div>
                            {folderHint ? (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 320,
                                }}
                              >
                                {folderHint}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    height: "100%",
                    border: "1px dashed #e2e8f0",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#64748b",
                    fontSize: 12,
                    padding: 12,
                    textAlign: "center",
                  }}
                >
                  尚未导入文件。你可以直接粘贴 YAML，或导入文件/文件夹。
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={yamlText}
              data-testid="yaml-textarea"
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
              }}
              spellCheck={false}
              style={{
                flex: 1,
                minHeight: 200,
                width: "100%",
                padding: 12,
                border: "none",
                resize: "none",
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                fontSize: 12,
                lineHeight: 1.45,
                outline: "none",
              }}
            />
          )}
        </aside>
        <div ref={flowContainerRef} style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            data-testid="react-flow"
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              requestAnimationFrame(() => instance.fitView({ padding: 0.18 }));
            }}
            minZoom={0.2}
            maxZoom={1.8}
            nodesDraggable={true}
            nodesConnectable={true}
            edgesUpdatable={true}
            elementsSelectable={true}
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{ interactionWidth: 36 }}
            connectionMode={ConnectionMode.Loose}
            connectionLineStyle={{ stroke: "#64748b", strokeWidth: 1.75 }}
          >
            <Background gap={14} />
            <Controls />
            <MiniMap nodeStrokeWidth={2} maskColor="rgba(15,23,42,0.08)" />
            <DiagramActions
              yamlText={yamlText}
              setYamlText={setYamlText}
              importedFiles={importedFiles}
              setImportedFiles={setImportedFiles}
              activeFileIndex={activeFileIndex}
              setActiveFileIndex={setActiveFileIndex}
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              setParsedMsg={setParsedMsg}
              flowContainerRef={flowContainerRef}
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
      <AuthGate>
        <AppInner />
      </AuthGate>
    </ReactFlowProvider>
  );
}
