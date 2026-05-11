import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readRuntimeAzureBaseUrl(): string | null {
  try {
    const p = path.join(__dirname, "public", "config.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const json = JSON.parse(raw) as { routeMergeAi?: { baseUrl?: unknown } };
    const baseUrl = json.routeMergeAi?.baseUrl;
    return typeof baseUrl === "string" ? baseUrl : null;
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const azureBase = env.VITE_AZURE_OPENAI_BASE_URL || readRuntimeAzureBaseUrl() || "";

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
                  const bearer = env.AZURE_API_KEY ?? env.VITE_AZURE_API_KEY;
                  const key = env.AZURE_OPENAI_API_KEY ?? env.VITE_AZURE_OPENAI_API_KEY;
                  if (bearer) {
                    proxyReq.setHeader("Authorization", `Bearer ${bearer}`);
                  } else if (key) {
                    proxyReq.setHeader("api-key", key);
                  }
                });
              },
            },
          },
        }
      : undefined,
  };
});
