import { describe, expect, it } from "vitest";
import {
  getAllEnabledModels,
  resolveProviderConfig,
} from "../../src/renderer/lib/providers";
import { opencodeGoPreset } from "../../src/renderer/lib/providers/presets/opencode-go";

describe("resolveProviderConfig", () => {
  it("returns preset models for added preset provider", () => {
    const resolved = resolveProviderConfig("opencode-go", [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: "https://example.com/v1" },
    ]);
    expect(resolved?.models.length).toBeGreaterThan(0);
    expect(resolved?.models.map((m) => m.id)).toContain("glm-5.1");
    expect(resolved?.defaultBaseUrl).toBe("https://example.com/v1");
  });
});

describe("getAllEnabledModels", () => {
  it("includes preset models from user-added providers", () => {
    const enabled = {
      "opencode-go": ["glm-5.1", "deepseek-v4-pro"],
    };
    const customProviders = [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: opencodeGoPreset.defaultBaseUrl },
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
      { id: "opencode-go", name: "OpenCode Go", baseUrl: opencodeGoPreset.defaultBaseUrl },
    ];
    const models = getAllEnabledModels(enabled, customModels, customProviders);
    expect(models.some((m) => m.model.id === "glm-5.2")).toBe(true);
  });
});
