import { describe, expect, it } from "vitest";
import {
  getAllEnabledModels,
  resolveProviderConfig,
} from "../../src/renderer/lib/providers";
import { opencodeGoPreset } from "../../src/renderer/lib/providers/presets/opencode-go";
import { zhipuPreset } from "../../src/renderer/lib/providers/presets/zhipu";

describe("resolveProviderConfig", () => {
  it("returns hand-maintained preset models for added non-catalog provider", () => {
    const resolved = resolveProviderConfig("zhipu", [
      { id: "zhipu", name: "智谱 GLM", baseUrl: "https://example.com/v1" },
    ]);
    expect(resolved?.models.length).toBeGreaterThan(0);
    expect(resolved?.models.map((m) => m.id)).toContain("GLM-5.1");
    expect(resolved?.defaultBaseUrl).toBe("https://example.com/v1");
    expect(zhipuPreset.models.length).toBeGreaterThan(0);
  });

  it("keeps OpenCode Go preset models empty until catalog/snapshots fill them", () => {
    const resolved = resolveProviderConfig("opencode-go", [
      { id: "opencode-go", name: "OpenCode Go", baseUrl: "https://example.com/v1" },
    ]);
    expect(resolved?.models).toEqual([]);
    expect(resolved?.defaultBaseUrl).toBe("https://example.com/v1");
  });
});

describe("getAllEnabledModels", () => {
  it("includes enabled model ids from user-added providers (stubs when no snapshot)", () => {
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
