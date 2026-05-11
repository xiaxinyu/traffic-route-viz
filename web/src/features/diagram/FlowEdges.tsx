import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "reactflow";

function spreadOffsetFromId(id: string): { dx: number; dy: number } {
  // Deterministic small spread to reduce label overlap in dense areas.
  // Keep offsets conservative to avoid surprising users.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const dyBucket = (h % 5) - 2; // [-2..2]
  const dxBucket = ((h >>> 8) % 3) - 1; // [-1..1]
  return { dx: dxBucket * 10, dy: dyBucket * 12 };
}

export function ReadableLabelEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    label,
    labelStyle,
    labelBgStyle,
  } = props;

  const pathArgs = {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  };

  const [edgePath, labelX, labelY] =
    // For label positioning we use the smoothstep helper universally; it is stable and exported.
    getSmoothStepPath(pathArgs);

  const { dx, dy } = spreadOffsetFromId(id);
  const text = typeof label === "string" ? label : label ? String(label) : "";
  const shouldRenderLabel = Boolean(text.trim());

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {shouldRenderLabel ? (
        <EdgeLabelRenderer>
          <div
            className="trv-edge-label"
            data-testid="edge-label"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX + dx}px, ${labelY + dy}px)`,
              fontSize: 12,
              lineHeight: 1,
              padding: "2px 6px",
              borderRadius: 8,
              border: "1px solid rgba(15,23,42,0.12)",
              background: "rgba(255,255,255,0.92)",
              color: "#0f172a",
              whiteSpace: "nowrap",
              userSelect: "none",
              pointerEvents: "none",
              ...(labelBgStyle ?? {}),
              ...(labelStyle ?? {}),
            }}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const edgeTypes = {
  readableLabel: ReadableLabelEdge,
};
