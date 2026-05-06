import { toPng } from "html-to-image";

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
export async function exportDiagramToPng(
  flowContainerEl: HTMLElement,
  downloadName = "topology-traffic-route-viz.png",
): Promise<void> {
  const dataUrl = await toPng(flowContainerEl, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#f9fafb",
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
