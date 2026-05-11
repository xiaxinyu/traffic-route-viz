import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RuntimeAzureConfig = {
  baseUrl?: string;
  apiKey?: string;
  bearerToken?: string;
};

function readRuntimeAzureConfig(): RuntimeAzureConfig | null {
  try {
    const p = path.join(__dirname, "public", "config.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const json = JSON.parse(raw) as {
      routeMergeAi?: { baseUrl?: unknown; apiKey?: unknown; bearerToken?: unknown };
    };
    const cfg = json.routeMergeAi;
    return {
      baseUrl: typeof cfg?.baseUrl === "string" ? cfg.baseUrl : undefined,
      apiKey: typeof cfg?.apiKey === "string" ? cfg.apiKey : undefined,
      bearerToken: typeof cfg?.bearerToken === "string" ? cfg.bearerToken : undefined,
    };
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const runtimeAzure = readRuntimeAzureConfig();
  const azureBase = env.VITE_AZURE_OPENAI_BASE_URL || runtimeAzure?.baseUrl || "";
  const azureProxyTarget = (() => {
    if (!azureBase) return "";
    try {
      return new URL(azureBase).origin;
    } catch {
      return azureBase.replace(/\/+$/, "");
    }
  })();

  return {
    plugins: [react()],
    server: azureProxyTarget
      ? {
          proxy: {
            "/trv-azure-openai": {
              target: azureProxyTarget,
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/trv-azure-openai/, "") || "/",
              configure: (proxy) => {
                proxy.on("proxyReq", (proxyReq) => {
                  const bearer =
                    env.AZURE_API_KEY ?? env.VITE_AZURE_API_KEY ?? runtimeAzure?.bearerToken;
                  const key =
                    env.AZURE_OPENAI_API_KEY ??
                    env.VITE_AZURE_OPENAI_API_KEY ??
                    runtimeAzure?.apiKey;
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
