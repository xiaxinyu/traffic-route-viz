import { ReactFlowProvider } from "reactflow";

import { AuthGate } from "../features/auth/AuthGate";

import { AppInner } from "./AppInner";

export function App() {
  return (
    <ReactFlowProvider>
      <AuthGate>
        <AppInner />
      </AuthGate>
    </ReactFlowProvider>
  );
}
