import { describe, expect, it } from "vitest";
import { buildRemoveCustomProviderPatch } from "@/lib/providers";

describe("buildRemoveCustomProviderPatch", () => {
  it("removes the provider entry and all per-provider leftovers", () => {
    const patch = buildRemoveCustomProviderPatch(
      {
        aiCustomProviders: [
          { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
          { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
        ],
        aiApiKeys: { deepseek: "sk-ds", openrouter: "sk-or" },
        aiBaseUrls: { deepseek: "https://api.deepseek.com", openrouter: "https://openrouter.ai/api/v1" },
        aiEnabledModels: { deepseek: ["deepseek-v4-flash"], openrouter: ["openai/gpt-4o"] },
        aiCustomModelsData: {
          deepseek: [{ id: "deepseek-v4-flash", name: "Flash", contextWindow: "128K" }],
        },
        aiVerifiedProviders: ["deepseek", "openrouter"],
        aiPinnedModelKeys: ["deepseek/deepseek-v4-flash", "openrouter/openai/gpt-4o"],
        aiModelThoughtLevels: {
          "deepseek/deepseek-v4-pro": "high",
          "openrouter/openai/gpt-4o": "medium",
        },
        aiProvider: "deepseek",
        aiModel: "deepseek-v4-flash",
        aiVisionFallbackModel: "deepseek/deepseek-v4-flash",
        aiSubagentModel: "openrouter/openai/gpt-4o",
      },
      "deepseek",
    );

    expect(patch.aiCustomProviders).toEqual([
      { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
    ]);
    expect(patch.aiApiKeys).toEqual({ openrouter: "sk-or" });
    expect(patch.aiBaseUrls).toEqual({ openrouter: "https://openrouter.ai/api/v1" });
    expect(patch.aiEnabledModels).toEqual({ openrouter: ["openai/gpt-4o"] });
    expect(patch.aiCustomModelsData).toEqual({});
    expect(patch.aiVerifiedProviders).toEqual(["openrouter"]);
    expect(patch.aiPinnedModelKeys).toEqual(["openrouter/openai/gpt-4o"]);
    expect(patch.aiModelThoughtLevels).toEqual({
      "openrouter/openai/gpt-4o": "medium",
    });
    expect(patch.aiProvider).toBe("");
    expect(patch.aiModel).toBeNull();
    expect(patch.aiVisionFallbackModel).toBeNull();
    expect(patch.aiSubagentModel).toBeUndefined();
  });
});
