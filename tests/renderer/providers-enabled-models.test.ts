import { describe, expect, it } from "vitest";
import {
  getAllEnabledModels,
  getPreset,
  resolveProviderConfig,
} from "../../src/renderer/lib/providers";

describe("resolveProviderConfig", () => {
  it("returns Pi preset metadata without hand-maintained model lists", () => {
    const resolved = resolveProviderConfig("opencode-go", [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: "https://example.com/v1" },
    ]);
    expect(resolved?.models).toEqual([]);
    expect(resolved?.defaultBaseUrl).toBe("https://example.com/v1");
    expect(getPreset("opencode-go")?.id).toBe("opencode-go");
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
});
