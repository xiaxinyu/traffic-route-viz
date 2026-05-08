import { toPng } from "html-to-image";
import { getNodesBounds, getViewportForBounds, type Node } from "reactflow";

function isToolbarOrChrome(el: HTMLElement): boolean {
  if (el.closest?.(".diagram-toolbar-panel")) return true;
  return (
    el.classList.contains("react-flow__controls") ||
    el.classList.contains("react-flow__minimap") ||
    el.classList.contains("react-flow__attribution") ||
    !!el.closest?.(".react-flow__controls") ||
    !!el.closest?.(".react-flow__minimap") ||
    !!el.closest?.(".react-flow__attribution")
  );
}

/**
 * 将 React Flow 容器转为 PNG（尽量排除缩放控件与小地图）。
 */
export function computePngExportFrame(nodes: Node[]): {
  width: number;
  height: number;
  viewport: { x: number; y: number; zoom: number };
} {
  const visible = nodes.filter((n) => !n.hidden);
  if (!visible.length) return { width: 1600, height: 900, viewport: { x: 0, y: 0, zoom: 1 } };

  const bounds = getNodesBounds(visible);
  const minSize = 640;
  const maxSize = 4096;
  const targetW = Math.max(minSize, Math.ceil(bounds.width + 240));
  const targetH = Math.max(minSize, Math.ceil(bounds.height + 240));
  const shrink = Math.min(1, maxSize / Math.max(targetW, targetH));
  const width = Math.max(minSize, Math.round(targetW * shrink));
  const height = Math.max(minSize, Math.round(targetH * shrink));
  const viewport = getViewportForBounds(bounds, width, height, 0.01, 2, 0.1);
  return { width, height, viewport };
}

export async function exportDiagramToPng(
  flowContainerEl: HTMLElement,
  nodes: Node[],
  downloadName = "topology-traffic-route-viz.png",
): Promise<void> {
  const frame = computePngExportFrame(nodes);
  const viewportEl =
    (flowContainerEl.querySelector(".react-flow__viewport") as HTMLElement | null) ?? flowContainerEl;

  const dataUrl = await toPng(viewportEl, {
    width: frame.width,
    height: frame.height,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#f9fafb",
    style: {
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      transform: `translate(${frame.viewport.x}px, ${frame.viewport.y}px) scale(${frame.viewport.zoom})`,
      transformOrigin: "0 0",
    },
    filter(domNode: unknown) {
      if (!(domNode instanceof HTMLElement)) return true;
      if (domNode.closest?.('[data-save-png-hide="true"]')) return false;
      if (isToolbarOrChrome(domNode)) return false;
      return true;
    },
  });

  const a = document.createElement("a");
  a.download = downloadName;
  a.href = dataUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
