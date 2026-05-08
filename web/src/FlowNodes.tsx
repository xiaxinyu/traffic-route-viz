import { memo, type CSSProperties } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";

import type { IngressTlsEntry, IstioRouteDestination } from "./k8sParser";

type EntryKind = "Ingress" | "VirtualService" | "HTTPProxy";

/**
 * Canonical node palette for a coordinated canvas style.
 * Keep this mapping in sync with HARNESS_ENGINEERING.md §7.x visual rules.
 */
export const NODE_COLOR_PALETTE = {
  ingress: "#4f46e5",
  virtualService: "#0284c7",
  httpProxy: "#0f766e",
  host: "#c026d3",
  route: "#d97706",
  service: "#2563eb",
  destinationRule: "#be185d",
  endpoints: "#0d9488",
  istioGateway: "#0369a1",
} as const;

export function accentForEntryKind(kind?: EntryKind): string {
  if (kind === "HTTPProxy") return NODE_COLOR_PALETTE.httpProxy;
  if (kind === "VirtualService") return NODE_COLOR_PALETTE.virtualService;
  return NODE_COLOR_PALETTE.ingress;
}

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

const handleBase: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 6,
  border: "2px solid #fff",
  background: "#94a3b8",
  boxShadow: "0 2px 8px rgba(15,23,42,0.18)",
};

const handle = (color: string, side: "left" | "right"): CSSProperties => ({
  ...handleBase,
  background: color,
  [side]: -7,
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
    swimlaneLabel,
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
    swimlaneLabel?: string;
  };

  const idx = partitionIndex ?? 1;
  const files = (sourceFiles ?? []).filter(Boolean);
  const kindLabel2 =
    entryKind === "HTTPProxy"
      ? "Contour Gateway"
      : entryKind === "VirtualService"
        ? "Istio VirtualService"
        : "Kubernetes Ingress";
  const accent = accentForEntryKind(entryKind);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 16,
        border: `1px solid ${accent}33`,
        background: `linear-gradient(165deg, ${accent}1A, ${accent}08)`,
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
          background: `${accent}24`,
          borderBottom: `1px solid ${accent}33`,
          cursor: "grab",
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b" }}>
          入口流量拓扑分区 · 第 {idx} 视图
        </div>
        <div style={{ fontSize: 11, marginTop: 4, color: accent, fontWeight: 700 }}>
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
        {swimlaneLabel ? (
          <div style={{ ...meta({ marginTop: 6 }), color: "#64748b", fontWeight: 600 }}>
            {swimlaneLabel}
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
  const accent = accentForEntryKind(kind);
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}` }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
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
      <div style={{ ...meta(), marginTop: 6, fontWeight: 600, color: "#334155" }}>TLS</div>
      {hasTls ? (
        tls!.map((t, i) => (
          <div key={i} style={meta({ marginTop: 2 })}>
            {t.secretName ? (
              <span style={{ color: "#1e40af" }}>secret: {t.secretName}</span>
            ) : (
              <span>（无 secret 名）</span>
            )}
            {t.hosts?.length ? (
              <div style={{ marginTop: 2 }}>hosts: {t.hosts.join(", ")}</div>
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
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
      <Handle type="source" position={Position.Left} id="s-left" style={handle(accent, "left")} />
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
  const accent = NODE_COLOR_PALETTE.host;
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}` }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
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
      {ingressName ? <div style={meta()}>ingress: {ingressName}</div> : null}
      <div style={{ ...meta(), marginTop: 4, fontWeight: 600, color: "#334155" }}>
        TLS（此 Host）
      </div>
      {tlsSecretName ? (
        <div style={{ ...meta(), color: "#1e40af", fontWeight: 600 }}>secret: {tlsSecretName}</div>
      ) : (
        <div style={meta()}>
          {entryKind === "HTTPProxy"
            ? "Contour Gateway 未解析 TLS（或未配置）"
            : "无匹配证书（或未配置 TLS）"}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
      <Handle type="source" position={Position.Left} id="s-left" style={handle(accent, "left")} />
    </div>
  );
});

export const ServiceNode = memo(function ServiceNode(props: NodeProps) {
  const {
    label,
    subtitle,
    type: st,
    clusterIP,
    ports,
    backendPort,
    istioSubsets,
  } = props.data as {
    label?: string;
    subtitle?: string;
    type?: string;
    clusterIP?: string;
    ports?: { port: number; targetPort?: number | string }[];
    backendPort?: number | string;
    istioSubsets?: string[];
  };
  const accent = NODE_COLOR_PALETTE.service;
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}` }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
      <Handle type="source" position={Position.Left} id="s-left" style={handle(accent, "left")} />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>Service</span>
        {st ? <span style={pill("#dbeafe", "#1d4ed8")}>{st}</span> : null}
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
        <div style={{ ...meta(), color: "#1d4ed8", fontWeight: 600 }}>
          Ingress backend 端口: {String(backendPort)}
        </div>
      ) : null}
      {ports?.length ? (
        <div style={{ fontSize: 11, marginTop: 4, color: "#475569" }}>
          spec ports: {ports.map((p) => `${p.port}→${p.targetPort ?? "?"}`).join(", ")}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
    </div>
  );
});

export const HttpProxyNode = memo(function HttpProxyNode(props: NodeProps) {
  const { label, subtitle } = props.data as { label?: string; subtitle?: string };
  const accent = NODE_COLOR_PALETTE.httpProxy;
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}`, background: "#f0fdfa" }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>HTTPProxy</span>
        <span style={pill("#ccfbf1", "#0f766e")}>Contour</span>
      </div>
      <div style={{ marginTop: 6, fontWeight: 900, color: "#064e3b" }}>{label ?? "—"}</div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
      <Handle type="source" position={Position.Left} id="s-left" style={handle(accent, "left")} />
    </div>
  );
});

export const IstioGatewayNode = memo(function IstioGatewayNode(props: NodeProps) {
  const { label, subtitle, servers, selector, globalGateway } = props.data as {
    label?: string;
    subtitle?: string;
    servers?: { port?: number; name?: string; protocol?: string; hosts: string[] }[];
    selector?: Record<string, string>;
    globalGateway?: boolean;
  };
  const accent = NODE_COLOR_PALETTE.istioGateway;
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}`, background: "#f0f9ff" }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>Istio Gateway</span>
        <span style={pill("#e0f2fe", "#0369a1")}>Gateway</span>
        {globalGateway ? (
          <span style={pill("#bae6fd", "#0369a1")} title="Merged entry shared by VirtualServices">
            Global
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: 6, fontWeight: 900, color: "#0f172a" }}>{label ?? "—"}</div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      {servers?.length ? (
        <div style={{ ...meta({ marginTop: 6 }), color: "#0f172a" }}>
          <div style={{ fontWeight: 800, color: "#0369a1" }}>Servers</div>
          <div style={{ marginTop: 2 }}>
            {servers.slice(0, 3).map((s, i) => (
              <div key={i} style={meta({ marginTop: 2 })}>
                {s.protocol ?? "?"} {s.port ?? "?"} {s.name ? `(${s.name})` : ""} ·{" "}
                {(s.hosts ?? []).slice(0, 2).join(", ")}
                {(s.hosts?.length ?? 0) > 2 ? ` (+${(s.hosts?.length ?? 0) - 2})` : ""}
              </div>
            ))}
            {servers.length > 3 ? (
              <div style={meta({ marginTop: 2 })}>…(+{servers.length - 3})</div>
            ) : null}
          </div>
        </div>
      ) : null}
      {selector && Object.keys(selector).length ? (
        <div style={{ ...meta({ marginTop: 6 }), color: "#334155" }}>
          selector:{" "}
          {Object.entries(selector)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
      <Handle type="source" position={Position.Left} id="s-left" style={handle(accent, "left")} />
    </div>
  );
});

export const DestinationRuleNode = memo(function DestinationRuleNode(props: NodeProps) {
  const { label, subtitle, host, subsets } = props.data as {
    label?: string;
    subtitle?: string;
    host?: string;
    subsets?: string[];
  };
  const accent = NODE_COLOR_PALETTE.destinationRule;
  return (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${accent}`, background: "#fff1f2" }}>
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>DestinationRule</span>
        <span style={pill("#ffe4e6", "#be185d")}>Istio</span>
      </div>
      <div style={{ marginTop: 6, fontWeight: 900, color: "#0f172a" }}>{label ?? "—"}</div>
      {subtitle ? <div style={meta()}>{subtitle}</div> : null}
      {host ? <div style={meta({ marginTop: 4 })}>host: {host}</div> : null}
      {subsets?.length ? (
        <div style={{ ...meta({ marginTop: 6 }), color: "#0f766e", fontWeight: 800 }}>
          subsets: {subsets.join(", ")}
        </div>
      ) : (
        <div style={meta({ marginTop: 6 })}>subsets: —</div>
      )}
    </div>
  );
});

export const RouteNode = memo(function RouteNode(props: NodeProps) {
  const {
    path,
    pathType,
    serviceName,
    servicePort,
    upstreamServiceName,
    upstreamServicePort,
    ingressKind,
    istioDestinations,
    istioRouteName,
    istioQueryParams,
    istioRequestHeadersSet,
  } = props.data as {
    path?: string;
    pathType?: string;
    serviceName?: string;
    servicePort?: number | string;
    upstreamServiceName?: string;
    upstreamServicePort?: number | string;
    ingressKind?: string;
    istioDestinations?: IstioRouteDestination[];
    istioRouteName?: string;
    istioQueryParams?: { key: string; op: string; value?: string }[];
    istioRequestHeadersSet?: Record<string, string>;
  };
  const accent = NODE_COLOR_PALETTE.route;
  return (
    <div
      style={{
        ...cardStyle,
        borderLeft: `5px solid ${accent}`,
        padding: "8px 12px",
        minWidth: 220,
        maxWidth: 340,
        background: "#fff7ed",
      }}
    >
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span>Route</span>
        {ingressKind === "VirtualService" ? (
          <span style={pill("#e0f2fe", "#0369a1")}>VirtualService</span>
        ) : null}
        {pathType ? <span style={pill("#ffedd5", "#c2410c")}>{pathType}</span> : null}
      </div>
      {ingressKind === "VirtualService" && istioRouteName ? (
        <div style={{ ...meta({ marginTop: 4 }), color: "#0f172a", fontWeight: 800 }}>
          name: {istioRouteName}
        </div>
      ) : null}
      <div style={{ marginTop: 4, fontWeight: 800, color: "#0f172a" }}>{path ?? "/"}</div>
      {ingressKind === "VirtualService" && istioQueryParams?.length ? (
        <div style={{ ...meta({ marginTop: 6 }), color: "#334155" }}>
          <div style={{ fontWeight: 900, marginBottom: 2 }}>queryParams</div>
          <div style={{ fontSize: 11, fontWeight: 650 }}>
            {istioQueryParams
              .map((q) => `${q.key}.${q.op}${q.value !== undefined ? `=${q.value}` : ""}`)
              .join(", ")}
          </div>
        </div>
      ) : null}
      {ingressKind === "VirtualService" &&
      istioRequestHeadersSet &&
      Object.keys(istioRequestHeadersSet).length ? (
        <div style={{ ...meta({ marginTop: 6 }), color: "#334155" }}>
          <div style={{ fontWeight: 900, marginBottom: 2 }}>headers.request.set</div>
          <div style={{ fontSize: 11, fontWeight: 650 }}>
            {Object.entries(istioRequestHeadersSet)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}
          </div>
        </div>
      ) : null}
      {ingressKind === "VirtualService" && istioDestinations?.length ? (
        <div style={{ ...meta(), marginTop: 6, color: "#0f172a", fontWeight: 700 }}>
          <div style={{ fontWeight: 900, marginBottom: 4 }}>Destinations</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 16,
              fontSize: 11,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            {istioDestinations.map((d, i) => (
              <li key={`${d.host}-${i}`} style={{ marginTop: 2 }}>
                <span style={{ color: "#2563eb" }}>{d.host}</span>
                {" · "}
                <span style={{ color: "#64748b" }}>:{String(d.port ?? "?")}</span>
                {d.subset ? (
                  <>
                    {" · "}
                    <span style={pill("#fce7f3", "#be185d")}>subset {d.subset}</span>
                  </>
                ) : null}
                {typeof d.weight === "number" ? (
                  <>
                    {" · "}
                    <span style={pill("#fef3c7", "#b45309")}>w={d.weight}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ ...meta(), marginTop: 4, color: "#1d4ed8", fontWeight: 700 }}>
          backend: {serviceName} :{String(servicePort ?? "?")}
        </div>
      )}
      {upstreamServiceName ? (
        <div style={{ ...meta({ marginTop: 2 }), color: "#0f766e", fontWeight: 700 }}>
          upstream: {upstreamServiceName} :{String(upstreamServicePort ?? "?")}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
      <Handle type="source" position={Position.Left} id="s-left" style={handle(accent, "left")} />
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
      <Handle type="target" position={Position.Left} id="t-left" style={handle(accent, "left")} />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        style={handle(accent, "right")}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        style={handle(accent, "right")}
      />
      <div style={titleRow()}>
        <span style={iconDot(accent)} />
        <span style={{ color: "#0f766e" }}>Endpoints</span>
        <span style={pill("#ccfbf1", "#0f766e")}>Pod IP</span>
      </div>
      {serviceName ? (
        <div style={{ ...meta(), fontWeight: 600, color: "#115e59" }}>service: {serviceName}</div>
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
          端口: {ports.map((p) => `${p.port}/${p.protocol ?? "TCP"}`).join(", ")}
        </div>
      ) : null}
    </div>
  );
});
