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

const meta = (s: CSSProperties = {}): CSSProperties => ({
  fontSize: 11,
  color: "#64748b",
  marginTop: 2,
  wordBreak: "break-word",
  ...s,
});

export const IngressNode = memo(function IngressNode(props: NodeProps) {
  const { label, subtitle, className, tls, loadBalancerIps } = props.data as {
    label?: string;
    subtitle?: string;
    className?: string;
    tls?: IngressTlsEntry[];
    loadBalancerIps?: string[];
  };
  const hasTls = tls && tls.length > 0;
  return (
    <div style={{ ...cardStyle, borderLeft: "4px solid #4f46e5" }}>
      <div style={{ fontWeight: 700, color: "#1e293b" }}>Ingress</div>
      <div style={{ marginTop: 4, fontWeight: 700, color: "#4f46e5" }}>{label}</div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      {className ? <div style={meta()}>class: {className}</div> : null}
      {loadBalancerIps && loadBalancerIps.length > 0 ? (
        <div style={meta({ color: "#0f766e" })}>
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
        <div style={meta()}>未配置 spec.tls（入口为 HTTP 或仅注解终端）</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const HostNode = memo(function HostNode(props: NodeProps) {
  const { label, tlsSecretName, ingressName } = props.data as {
    label?: string;
    tlsSecretName?: string;
    ingressName?: string;
  };
  return (
    <div style={{ ...cardStyle, borderLeft: "4px solid #7c3aed" }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 700, color: "#6d28d9", fontSize: 12 }}>Host</div>
      <div
        style={{
          marginTop: 4,
          wordBreak: "break-all",
          fontWeight: 700,
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
        <div style={meta()}>无匹配证书（或未配置 TLS）</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const ServiceNode = memo(function ServiceNode(props: NodeProps) {
  const { label, subtitle, type: st, clusterIP, ports, backendPort } = props.data as {
    label?: string;
    subtitle?: string;
    type?: string;
    clusterIP?: string;
    ports?: { port: number; targetPort?: number | string }[];
    backendPort?: number | string;
  };
  return (
    <div style={{ ...cardStyle, borderLeft: "4px solid #6366f1" }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 700, color: "#4338ca", fontSize: 12 }}>Service</div>
      <div style={{ marginTop: 4, fontWeight: 700, color: "#312e81" }}>{label}</div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      {st ? <div style={meta()}>type: {st}</div> : null}
      {clusterIP ? <div style={meta()}>clusterIP: {clusterIP}</div> : null}
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export const RouteNode = memo(function RouteNode(props: NodeProps) {
  const { path, pathType, serviceName, servicePort } = props.data as {
    path?: string;
    pathType?: string;
    serviceName?: string;
    servicePort?: number | string;
  };
  return (
    <div
      style={{
        ...cardStyle,
        borderLeft: "4px solid #7c3aed",
        padding: "8px 12px",
        minWidth: 220,
        maxWidth: 340,
        background: "#faf5ff",
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 800, color: "#6d28d9", fontSize: 12 }}>Route</div>
      <div style={{ marginTop: 4, fontWeight: 800, color: "#0f172a" }}>
        {path ?? "/"}
      </div>
      {pathType ? <div style={meta()}>pathType: {pathType}</div> : null}
      <div style={{ ...meta(), marginTop: 4, color: "#4338ca", fontWeight: 700 }}>
        backend: {serviceName} :{String(servicePort ?? "?")}
      </div>
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
  return (
    <div style={{ ...cardStyle, borderLeft: "4px solid #0d9488" }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 700, color: "#0f766e", fontSize: 12 }}>
        Endpoints
      </div>
      {serviceName ? (
        <div style={{ ...meta(), fontWeight: 600, color: "#115e59" }}>
          service: {serviceName}
        </div>
      ) : null}
      <div style={{ ...meta(), marginTop: 4, fontWeight: 600 }}>Pod IP</div>
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
