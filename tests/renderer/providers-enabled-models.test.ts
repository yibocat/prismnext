import { describe, expect, it, vi } from "vitest";
import {
  getAllEnabledModels,
  getPreset,
  resolveProviderConfig,
} from "../../src/renderer/lib/providers";
import type { ProviderConfig } from "../../src/renderer/lib/providers";

// Simulate a completed Pi catalog prefetch for `opencode-go`: the catalog list
// is what mergeProviderWithPiCatalog would put into provider.models at runtime.
const { catalogFixture } = vi.hoisted(() => {
  const catalogFixture = [
    { id: "glm-5.1", name: "GLM-5.1", contextWindow: "200K", capabilities: { vision: false } },
    { id: "glm-5.2", name: "GLM-5.2", contextWindow: "1M", capabilities: { vision: true } },
    { id: "deepseek-v4", name: "DeepSeek V4", contextWindow: "128K" },
  ];
  return { catalogFixture };
});

vi.mock("../../src/renderer/lib/providers/pi-model-catalog", async (importOriginal) => {
  const mod = await importOriginal<
    typeof import("../../src/renderer/lib/providers/pi-model-catalog")
  >();
  return {
    ...mod,
    mergeProviderWithPiCatalog: (provider: ProviderConfig): ProviderConfig =>
      provider.id === "opencode-go"
        ? { ...provider, models: catalogFixture }
        : provider,
  };
});

describe("resolveProviderConfig", () => {
  it("returns Pi preset metadata without hand-maintained model lists", () => {
    const resolved = resolveProviderConfig("opencode-go", [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: "https://example.com/v1" },
    ]);
    expect(resolved?.id).toBe("opencode-go");
    expect(resolved?.defaultBaseUrl).toBe("https://example.com/v1");
    // Presets carry no hand-maintained model lists; catalog fills them at runtime.
    expect(getPreset("opencode-go")?.models).toEqual([]);
  });

  it("keeps all Pi preset models empty until catalog/snapshots fill them", () => {
    for (const id of ["opencode", "opencode-go", "zai-coding-cn", "moonshotai", "openai", "anthropic"]) {
      const preset = getPreset(id);
      expect(preset).toBeDefined();
      expect(preset!.models).toEqual([]);
    }
  });
});

describe("getAllEnabledModels", () => {
  it("includes enabled model ids from user-added providers (stubs when no snapshot)", () => {
    const enabled = {
      "opencode-go": ["glm-5.1", "deepseek-v4-pro"],
    };
    const customProviders = [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: getPreset("opencode-go")?.defaultBaseUrl ?? "" },
    ];
    const models = getAllEnabledModels(enabled, {}, customProviders);
    const ids = models
      .filter((m) => m.provider.id === "opencode-go")
      .map((m) => m.model.id);
    expect(ids).toContain("glm-5.1");
    expect(ids).toContain("deepseek-v4-pro");
    expect(ids).not.toContain("glm-5.2");
  });

  it("merges manually added custom models for added providers", () => {
    const enabled = { "opencode-go": ["glm-5.2"] };
    const customModels = {
      "opencode-go": [{ id: "glm-5.2", name: "GLM-5.2", contextWindow: "1M" }],
    };
    const customProviders = [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: getPreset("opencode-go")?.defaultBaseUrl ?? "" },
    ];
    const models = getAllEnabledModels(enabled, customModels, customProviders);
    expect(models.some((m) => m.model.id === "glm-5.2")).toBe(true);
  });

  it("never duplicates a model when the Pi catalog and saved snapshots share ids", () => {
    // Reproduces the reported bug: the Pi catalog prefetch fills provider.models
    // with the full model list, while aiCustomModelsData also saved snapshots of
    // the same selected models. Both sources are enabled → they must not double.
    const enabled = { "opencode-go": ["glm-5.1", "glm-5.2", "deepseek-v4"] };
    const customProviders = [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: getPreset("opencode-go")?.defaultBaseUrl ?? "" },
    ];
    const customModels = {
      "opencode-go": [
        { id: "glm-5.1", name: "GLM-5.1", contextWindow: "200K" },
        { id: "glm-5.2", name: "GLM-5.2", contextWindow: "1M" },
      ],
    };

    const models = getAllEnabledModels(enabled, customModels, customProviders);
    const goIds = models
      .filter((m) => m.provider.id === "opencode-go")
      .map((m) => m.model.id);

    expect(goIds.filter((id) => id === "glm-5.1")).toHaveLength(1);
    expect(goIds.filter((id) => id === "glm-5.2")).toHaveLength(1);
    expect(goIds.filter((id) => id === "deepseek-v4")).toHaveLength(1);
    expect(goIds).toEqual(["glm-5.1", "glm-5.2", "deepseek-v4"]);
  });
});
