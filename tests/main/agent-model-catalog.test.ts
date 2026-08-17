import { describe, expect, it, vi } from "vitest";
import {
  effortsFromPiModel,
  formatAgentContextWindow,
  listAgentModels,
  mapPiProviderToProduct,
  mapProductProviderToPi,
  resolveModelsListUrl,
  testAgentConnection,
  toAgentModelRow,
  validateApiKey,
  type AgentModelRuntimeLike,
} from "../../src/main/agent/model-catalog";

function fakeModel(partial: {
  id: string;
  name?: string;
  provider?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: string[];
  contextWindow?: number;
}): Parameters<typeof toAgentModelRow>[0] {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    provider: partial.provider ?? "anthropic",
    reasoning: partial.reasoning ?? false,
    thinkingLevelMap: partial.thinkingLevelMap,
    input: partial.input ?? ["text"],
    contextWindow: partial.contextWindow ?? 200_000,
  };
}

function fakeRuntime(models: ReturnType<typeof fakeModel>[]): AgentModelRuntimeLike {
  return {
    async setRuntimeApiKey() {},
    async removeRuntimeApiKey() {},
    getModels(providerId) {
      return providerId ? models.filter((m) => m.provider === providerId) : models;
    },
    getModel(providerId, modelId) {
      return models.find((m) => m.provider === providerId && m.id === modelId);
    },
  };
}

describe("agent model catalog mapping", () => {
  it("maps legacy and Pi provider ids onto Pi provider ids", () => {
    expect(mapProductProviderToPi("opencode-zen")).toBe("opencode");
    expect(mapProductProviderToPi("zhipu")).toBe("zai-coding-cn");
    expect(mapProductProviderToPi("kimi")).toBe("moonshotai");
    expect(mapProductProviderToPi("opencode")).toBe("opencode");
    expect(mapProductProviderToPi("opencode-go")).toBe("opencode-go");
    expect(mapProductProviderToPi("anthropic")).toBe("anthropic");
    expect(mapProductProviderToPi("custom")).toBeNull();
    expect(mapProductProviderToPi("custom-123")).toBeNull();
    expect(mapPiProviderToProduct("opencode")).toBe("opencode");
    expect(mapPiProviderToProduct("opencode-go")).toBe("opencode-go");
    expect(mapPiProviderToProduct("zai-coding-cn")).toBe("zai-coding-cn");
  });

  it("formats context windows and vision/effort from a Pi model", () => {
    expect(formatAgentContextWindow(200_000)).toBe("200K");
    expect(formatAgentContextWindow(1_000_000)).toBe("1M");
    expect(formatAgentContextWindow(0)).toBe("Unknown");

    const row = toAgentModelRow(fakeModel({
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      reasoning: true,
      thinkingLevelMap: { off: "off", low: "low", high: "high", max: null },
      input: ["text", "image"],
      contextWindow: 200_000,
    }));
    expect(row.contextWindow).toBe("200K");
    expect(row.capabilities?.vision).toBe(true);
    expect(row.efforts).toEqual(["low", "high"]);
  });

  it("returns no effort ids when the model has no reasoning surface", () => {
    expect(effortsFromPiModel(fakeModel({ id: "gpt-4o-mini", reasoning: false }))).toEqual([]);
  });

  it("rejects empty and non-ASCII API keys before any network call", () => {
    expect(validateApiKey("")).toEqual({ ok: false, reason: "empty" });
    expect(validateApiKey("  ")).toEqual({ ok: false, reason: "empty" });
    expect(validateApiKey("sk-中文")).toEqual({ ok: false, reason: "non_ascii" });
    expect(validateApiKey("sk-ascii")).toEqual({ ok: true, key: "sk-ascii" });
  });

  it("does not append a second /v1 when the base already ends with a version", () => {
    expect(resolveModelsListUrl("https://api.openai.com")).toBe("https://api.openai.com/v1/models");
    expect(resolveModelsListUrl("https://opencode.ai/zen/go/v1")).toBe(
      "https://opencode.ai/zen/go/v1/models",
    );
  });
});

describe("agent model catalog queries", () => {
  it("lists models from the injected Pi runtime and keys them by product provider", async () => {
    const result = await listAgentModels(
      { providerId: "opencode-zen" },
      {
        createRuntime: async () => fakeRuntime([
          fakeModel({
            id: "gpt-5.5",
            name: "GPT 5.5",
            provider: "opencode",
            contextWindow: 400_000,
          }),
        ]),
      },
    );
    expect(result.source).toBe("pi");
    expect(result.models).toEqual([
      expect.objectContaining({ id: "gpt-5.5", name: "GPT 5.5", contextWindow: "400K" }),
    ]);
  });

  it("falls back to the HTTP models list for custom providers", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "local-7b", name: "Local 7B" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await listAgentModels(
      { providerId: "custom", apiKey: "sk-local", baseUrl: "http://127.0.0.1:8080/v1" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.source).toBe("api");
    expect(result.models.map((m) => m.id)).toEqual(["local-7b"]);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("tests a connection with the HTTP probe and never treats checkAuth as success", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4-5" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await testAgentConnection(
      { provider: "anthropic", apiKey: "sk-ant" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result).toEqual({
      success: true,
      models: ["claude-sonnet-4-5"],
    });
  });

  it("fails closed on a non-JSON probe response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("<html>nope</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const result = await testAgentConnection(
      { provider: "openai", apiKey: "sk-openai" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.success).toBe(false);
  });
});
