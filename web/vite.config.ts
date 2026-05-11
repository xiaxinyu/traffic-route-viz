import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const azureBase = env.VITE_AZURE_OPENAI_BASE_URL;

  return {
    plugins: [react()],
    server: azureBase
      ? {
          proxy: {
            "/trv-azure-openai": {
              target: azureBase.replace(/\/+$/, ""),
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/trv-azure-openai/, ""),
              configure: (proxy) => {
                proxy.on("proxyReq", (proxyReq) => {
                  const key = env.AZURE_OPENAI_API_KEY ?? env.VITE_AZURE_OPENAI_API_KEY;
                  if (key) proxyReq.setHeader("api-key", key);
                });
              },
            },
          },
        }
      : undefined,
  };
});
