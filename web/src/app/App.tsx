import { ReactFlowProvider } from "reactflow";

import { AuthGate } from "../features/auth/AuthGate";

import { AppInner } from "./AppInner";
import { HomePortal } from "./HomePortal";
import { usePortalHashRoute } from "./portalHashRoute";
import { ResourceStatsHome } from "./ResourceStatsHome";

export function App() {
  const portalRoute = usePortalHashRoute();

  return (
    <ReactFlowProvider>
      <AuthGate>
        {portalRoute === "home" ? (
          <HomePortal />
        ) : portalRoute === "viz" ? (
          <AppInner />
        ) : (
          <ResourceStatsHome />
        )}
      </AuthGate>
    </ReactFlowProvider>
  );
}
