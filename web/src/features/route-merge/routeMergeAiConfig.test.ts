import { describe, expect, it } from "vitest";

import {
  buildAzureOpenAiChatCompletionsUrl,
  buildAzureOpenAiResponsesUrl,
  buildDevProxyBaseUrl,
  buildOpenAiV1ChatCompletionsUrl,
} from "./routeMergeAiConfig";

describe("routeMergeAiConfig URL builders", () => {
  it("keeps the Azure /openai path when dev proxying deployments requests", () => {
    const proxyBase = buildDevProxyBaseUrl(
      "http://localhost:5173",
      "https://example.cognitiveservices.azure.com/openai",
      "azure-deployments",
    );

    expect(buildAzureOpenAiChatCompletionsUrl(proxyBase, "gpt-5.1", "2025-04-01-preview")).toBe(
      "http://localhost:5173/trv-azure-openai/openai/deployments/gpt-5.1/chat/completions?api-version=2025-04-01-preview",
    );
  });

  it("maps full Azure responses base URLs to the local dev proxy without duplicating responses", () => {
    const proxyBase = buildDevProxyBaseUrl(
      "http://localhost:5173",
      "https://example.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview",
      "azure-responses",
    );

    expect(buildAzureOpenAiResponsesUrl(proxyBase, "2025-04-01-preview")).toBe(
      "http://localhost:5173/trv-azure-openai/openai/responses?api-version=2025-04-01-preview",
    );
  });

  it("maps Azure OpenAI v1 base URLs to the local dev proxy", () => {
    const proxyBase = buildDevProxyBaseUrl(
      "http://localhost:5173",
      "https://example.cognitiveservices.azure.com/openai/v1",
      "openai-v1",
    );

    expect(buildOpenAiV1ChatCompletionsUrl(proxyBase)).toBe(
      "http://localhost:5173/trv-azure-openai/openai/v1/chat/completions",
    );
  });

  it("treats root Azure endpoints as /openai for deployments-style requests", () => {
    const proxyBase = buildDevProxyBaseUrl(
      "http://localhost:5173",
      "https://example.cognitiveservices.azure.com/",
      "azure-deployments",
    );

    expect(buildAzureOpenAiChatCompletionsUrl(proxyBase, "gpt-4o", "2025-04-01-preview")).toBe(
      "http://localhost:5173/trv-azure-openai/openai/deployments/gpt-4o/chat/completions?api-version=2025-04-01-preview",
    );
  });
});
