import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { loadRuntimeConfig } from "./runtimeConfig";

import "./index.css";

(async () => {
  await loadRuntimeConfig();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
