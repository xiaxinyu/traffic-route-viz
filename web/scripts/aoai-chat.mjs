import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import { AzureOpenAI } from "openai";

function loadEnv() {
  // Prefer .env.local (not committed). Fallback to .env.
  const root = process.cwd();
  const candidates = [path.join(root, ".env.local"), path.join(root, ".env")];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return p;
    }
  }
  return null;
}

function mustGet(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function withTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const loaded = loadEnv();
  if (loaded) {
    // eslint-disable-next-line no-console
    console.info(`[aoai-chat] loaded env from ${path.basename(loaded)}`);
  }

  const endpoint = withTrailingSlash(mustGet("AZURE_OPENAI_ENDPOINT"));
  const apiKey = mustGet("AZURE_OPENAI_API_KEY");
  const apiVersion = (process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview").trim();
  const deployment = mustGet("AZURE_OPENAI_DEPLOYMENT");
  const model = (process.env.AZURE_OPENAI_MODEL || deployment).trim();

  const client = new AzureOpenAI({ endpoint, apiKey, deployment, apiVersion });

  const input =
    process.argv.slice(2).join(" ").trim() || "I am going to Paris, what should I see?";

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: input },
        ],
        max_completion_tokens: 16_384,
        temperature: 0.2,
      });

      const text = response?.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("Empty model response content.");
      // eslint-disable-next-line no-console
      console.log(text);
      return;
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const requestId =
        err?.headers?.["x-ms-request-id"] ??
        err?.response?.headers?.["x-ms-request-id"] ??
        err?.headers?.["apim-request-id"] ??
        err?.response?.headers?.["apim-request-id"];

      const message = err?.message ? String(err.message) : String(err);
      const retryable = status === 429 || (typeof status === "number" && status >= 500);

      if (!retryable || attempt === maxAttempts) {
        throw new Error(
          `AzureOpenAI request failed (status=${status ?? "unknown"}, requestId=${requestId ?? "n/a"}): ${message}`,
        );
      }

      const backoff = 500 * 2 ** (attempt - 1);
      // eslint-disable-next-line no-console
      console.warn(
        `[aoai-chat] retrying after ${backoff}ms (attempt ${attempt}/${maxAttempts}) status=${status ?? "unknown"} requestId=${requestId ?? "n/a"}`,
      );
      await sleep(backoff);
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[aoai-chat] error:", err);
  process.exitCode = 1;
});

