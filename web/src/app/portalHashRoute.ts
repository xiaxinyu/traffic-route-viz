import { useSyncExternalStore } from "react";

export type PortalRoute = "home" | "viz" | "resource-stats";

export function parsePortalHash(hash: string): PortalRoute {
  const trimmed = hash.trim();
  const path = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  const seg = path.replace(/^\//, "").split("/")[0] ?? "";
  if (seg === "viz" || seg === "diagram") return "viz";
  if (
    seg === "resource-stats" ||
    seg === "stats" ||
    seg === "local-folder" ||
    seg === "folder"
  ) {
    return "resource-stats";
  }
  return "home";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getPortalRouteSnapshot(): PortalRoute {
  return parsePortalHash(window.location.hash);
}

export function usePortalHashRoute(): PortalRoute {
  return useSyncExternalStore(subscribe, getPortalRouteSnapshot, () => "home");
}
