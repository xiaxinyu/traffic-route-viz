import { memo, type CSSProperties } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";

import type { IngressTlsEntry } from "./k8sParser";

const cardStyle: CSSProperties = {
  borderRadius: 10,
  padding: "10px 14px",
  minWidth: 160,
  maxWidth: 300,
  fontSize: 13,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
};

const titleRow = (): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
  color: "#0f172a",
});

const iconDot = (accent: string): CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: 3,
  background: accent,
  boxShadow: `0 0 0 3px ${accent}22`,
  flexShrink: 0,
});

const pill = (bg: string, fg: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 800,
  padding: "2px 8px",
  borderRadius: 999,
  background: bg,
  color: fg,
});

const meta = (s: CSSProperties = {}): CSSProperties => ({
  fontSize: 11,
  color: "#64748b",
  marginTop: 2,
  wordBreak: "break-word",
  ...s,
});

/** 可拖拽的整块拓扑分区底板（Ingress 及以下子节点挂载在其下） */
export const IngressRegionNode = memo(function IngressRegionNode(props: NodeProps) {
  const {
    partitionIndex,
    entryKind,
    ingressName,
    namespace,
    sourceSummary,
    sourceFiles,
    hint,
    tierCode,
    tierHint,
  } = props.data as {
    partitionIndex?: number;
    entryKind?: "Ingress" | "VirtualService" | "HTTPProxy";
    ingressName?: string;
    namespace?: string;
    sourceSummary?: string;
    sourceFiles?: string[];
    hint?: string;
    tierCode?: "01" | "02" | "03";
    tierHint?: string;
  };

  const idx = partitionIndex ?? 1;
  const files = (sourceFiles ?? []).filter(Boolean);
  const kindLabel2 =
    entryKind === "HTTPProxy"
      ? "Contour Gateway"
      : entryKind === "VirtualService"
        ? "Istio VirtualService"
        : "Kubernetes Ingress";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 16,
        border: "1px solid rgba(79, 70, 229, 0.22)",
        background:
          "linear-gradient(165deg, rgba(79,70,229,0.10), rgba(79,70,229,0.03))",
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: "10px 14px",
          background: "rgba(79, 70, 229, 0.14)",
          borderBottom: "1px solid rgba(79, 70, 229, 0.2)",
          cursor: "grab",
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "#312e81" }}>
          入口流量拓扑分区 · 第 {idx} 视图
        </div>
        <div
          style={{ fontSize: 11, marginTop: 4, color: "#4338ca", fontWeight: 700 }}
        >
          {kindLabel2}：{ingressName ?? "—"}
        </div>
        {tierCode ? (
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#0f172a",
                background: "rgba(15, 23, 42, 0.06)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
              title={`example tier: ${tierCode}`}
            >
              Level {Number(tierCode)}
            </span>
            {tierHint ? (
              <span style={{ ...meta({ marginTop: 0 }), color: "#57534e" }} title={tierHint}>
                {tierHint}
              </span>
            ) : null}
          </div>
        ) : null}
        <div style={{ ...meta({ marginTop: 2 }), color: "#57534e" }}>
          命名空间：{namespace ?? "—"}
        </div>
        {files.length > 0 ? (
          <div style={{ ...meta({ marginTop: 6 }), color: "#57534e" }}>
            <span style={{ fontWeight: 700 }}>来源文件：</span>
            <span
              style={{
                display: "inline-block",
                maxWidth: 520,
                verticalAlign: "top",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={files.join("，")}
            >
              {files.join("，")}
            </span>
          </div>
        ) : sourceSummary ? (
          <div style={{ ...meta({ marginTop: 6 }), color: "#57534e" }}>{sourceSummary}</div>
        ) : null}
        {hint ? (
          <div style={{ ...meta({ marginTop: 4 }), color: "#6b7280" }}>{hint}</div>
        ) : (
          <div style={{ ...meta({ marginTop: 4 }), color: "#6b7280" }}>
            拖拽本分区标题栏或空白底板可整体平移画布中的本组资源
          </div>
        )}
      </div>
    </div>
  );
});

export const IngressNode = memo(function IngressNode(props: NodeProps) {
  const { label, subtitle, className, tls, loadBalancerIps, kind } = props.data as {
    label?: string;
    subtitle?: string;
    className?: string;
    tls?: IngressTlsEntry[];
    loadBalancerIps?: string[];
    kind?: "Ingress" | "VirtualService" | "HTTPProxy";
  };
  const hasTls = tls && tls.length > 0;
  const accent =
    kind === "HTTPProxy" ? "#0f766e" : kind === "VirtualService" ? "#0ea5e9" : "#4f46e5";
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}` }}>
      <Handle type="target" position={Position.Left} id="t-left" />
      <Handle type="target" position={Position.Right} id="t-right" />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>
          {kind === "VirtualService"
            ? "VirtualService"
            : kind === "HTTPProxy"
              ? "Contour Gateway"
              : "Ingress"}
        </span>
        <span style={pill(`${accent}14`, accent)}>
          {kind === "VirtualService" ? "Istio" : kind === "HTTPProxy" ? "Contour" : "K8s"}
        </span>
      </div>
      <div style={{ marginTop: 6, fontWeight: 900, color: accent, wordBreak: "break-word" }}>
        {label}
      </div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      {className ? <div style={meta()}>class: {className}</div> : null}
      {loadBalancerIps && loadBalancerIps.length > 0 ? (
        <div style={meta({ color: "#0f766e", fontWeight: 700 })}>
          LB / status IP: {loadBalancerIps.join(", ")}
        </div>
      ) : null}
      <div style={{ ...meta(), marginTop: 6, fontWeight: 600, color: "#334155" }}>
        TLS
      </div>
      {hasTls ? (
        tls!.map((t, i) => (
          <div key={i} style={meta({ marginTop: 2 })}>
            {t.secretName ? (
              <span style={{ color: "#1e40af" }}>secret: {t.secretName}</span>
            ) : (
              <span>（无 secret 名）</span>
            )}
            {t.hosts?.length ? (
              <div style={{ marginTop: 2 }}>
                hosts: {t.hosts.join(", ")}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <div style={meta()}>
          {kind === "VirtualService"
            ? "VirtualService 不展示 Ingress TLS（请查看 Gateway/证书配置）"
            : kind === "HTTPProxy"
              ? "Contour Gateway 未配置 TLS（或未解析）"
              : "未配置 spec.tls（入口为 HTTP 或仅注解终端）"}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const HostNode = memo(function HostNode(props: NodeProps) {
  const { label, tlsSecretName, ingressName, entryKind } = props.data as {
    label?: string;
    tlsSecretName?: string;
    ingressName?: string;
    entryKind?: "Ingress" | "VirtualService" | "HTTPProxy";
  };
  const accent = "#7c3aed";
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}` }}>
      <Handle type="target" position={Position.Left} />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>Host</span>
      </div>
      <div
        style={{
          marginTop: 6,
          wordBreak: "break-all",
          fontWeight: 900,
          color: "#0f172a",
          fontSize: 14,
        }}
      >
        {label}
      </div>
      {ingressName ? (
        <div style={meta()}>ingress: {ingressName}</div>
      ) : null}
      <div style={{ ...meta(), marginTop: 4, fontWeight: 600, color: "#334155" }}>
        TLS（此 Host）
      </div>
      {tlsSecretName ? (
        <div style={{ ...meta(), color: "#1e40af", fontWeight: 600 }}>
          secret: {tlsSecretName}
        </div>
      ) : (
        <div style={meta()}>
          {entryKind === "HTTPProxy"
            ? "Contour Gateway 未解析 TLS（或未配置）"
            : "无匹配证书（或未配置 TLS）"}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const ServiceNode = memo(function ServiceNode(props: NodeProps) {
  const { label, subtitle, type: st, clusterIP, ports, backendPort, istioSubsets } = props.data as {
    label?: string;
    subtitle?: string;
    type?: string;
    clusterIP?: string;
    ports?: { port: number; targetPort?: number | string }[];
    backendPort?: number | string;
    istioSubsets?: string[];
  };
  const accent = "#4f46e5";
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}` }}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Left} id="s-left" />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>Service</span>
        {st ? <span style={pill("#eef2ff", "#3730a3")}>{st}</span> : null}
      </div>
      <div style={{ marginTop: 6, fontWeight: 900, color: "#0f172a", wordBreak: "break-word" }}>
        {label}
      </div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      {clusterIP ? <div style={meta()}>clusterIP: {clusterIP}</div> : null}
      {istioSubsets?.length ? (
        <div style={{ ...meta({ marginTop: 4 }), color: "#0f766e", fontWeight: 700 }}>
          Istio subsets: {istioSubsets.join(", ")}
        </div>
      ) : null}
      {backendPort !== undefined && backendPort !== "?" ? (
        <div style={{ ...meta(), color: "#4338ca", fontWeight: 600 }}>
          Ingress backend 端口: {String(backendPort)}
        </div>
      ) : null}
      {ports?.length ? (
        <div style={{ fontSize: 11, marginTop: 4, color: "#475569" }}>
          spec ports:{" "}
          {ports.map((p) => `${p.port}→${p.targetPort ?? "?"}`).join(", ")}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} id="s-right" />
    </div>
  );
});

export const HttpProxyNode = memo(function HttpProxyNode(props: NodeProps) {
  const { label, subtitle } = props.data as { label?: string; subtitle?: string };
  const accent = "#0f766e";
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}`, background: "#f0fdfa" }}>
      <Handle type="target" position={Position.Left} />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>HTTPProxy</span>
        <span style={pill("#ccfbf1", "#0f766e")}>Contour</span>
      </div>
      <div style={{ marginTop: 6, fontWeight: 900, color: "#064e3b" }}>{label ?? "—"}</div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const RouteNode = memo(function RouteNode(props: NodeProps) {
  const { path, pathType, serviceName, servicePort, upstreamServiceName, upstreamServicePort } =
    props.data as {
    path?: string;
    pathType?: string;
    serviceName?: string;
    servicePort?: number | string;
    upstreamServiceName?: string;
    upstreamServicePort?: number | string;
  };
  const accent = "#6d28d9";
  return (
    <div
      style={{
        ...cardStyle,
        borderLeft: `5px solid ${accent}`,
        padding: "8px 12px",
        minWidth: 220,
        maxWidth: 340,
        background: "#faf5ff",
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>Route</span>
        {pathType ? <span style={pill("#f3e8ff", "#6d28d9")}>{pathType}</span> : null}
      </div>
      <div style={{ marginTop: 4, fontWeight: 800, color: "#0f172a" }}>
        {path ?? "/"}
      </div>
      <div style={{ ...meta(), marginTop: 4, color: "#4338ca", fontWeight: 700 }}>
        backend: {serviceName} :{String(servicePort ?? "?")}
      </div>
      {upstreamServiceName ? (
        <div style={{ ...meta({ marginTop: 2 }), color: "#0f766e", fontWeight: 700 }}>
          upstream: {upstreamServiceName} :{String(upstreamServicePort ?? "?")}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const EndpointsNode = memo(function EndpointsNode(props: NodeProps) {
  const { ips, ports, serviceName } = props.data as {
    ips?: string[];
    ports?: { port: number; protocol?: string }[];
    serviceName?: string;
  };
  const accent = "#0d9488";
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}` }}>
      <Handle type="target" position={Position.Left} />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span style={{ color: "#0f766e" }}>Endpoints</span>
        <span style={pill("#ccfbf1", "#0f766e")}>Pod IP</span>
      </div>
      {serviceName ? (
        <div style={{ ...meta(), fontWeight: 600, color: "#115e59" }}>
          service: {serviceName}
        </div>
      ) : null}
      <ul
        style={{
          margin: "4px 0 0",
          paddingLeft: 18,
          fontSize: 12,
          color: "#0f172a",
          fontWeight: 600,
        }}
      >
        {ips?.map((ip) => (
          <li key={ip}>{ip}</li>
        ))}
      </ul>
      {ports?.length ? (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
          端口:{" "}
          {ports.map((p) => `${p.port}/${p.protocol ?? "TCP"}`).join(", ")}
        </div>
      ) : null}
    </div>
  );
});
