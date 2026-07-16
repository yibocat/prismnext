import { describe, expect, it } from "vitest";
import {
  buildCustomModelEntry,
  getConfiguredVisionModels,
  modelSupportsVision,
} from "../../src/renderer/lib/providers";
import { opencodeGoPreset } from "../../src/renderer/lib/providers/presets/opencode-go";

describe("provider model capabilities", () => {
  it("preserves vision capability on custom models", () => {
    const model = buildCustomModelEntry("custom-vision", "Custom Vision", "128K", {
      vision: true,
    });
    expect(modelSupportsVision(model)).toBe(true);
  });

  it("lists only configured, enabled vision models for helper picker", () => {
    const customProviders = [
      {
        id: "opencode-go",
        name: "OpenCode Go",
        baseUrl: opencodeGoPreset.defaultBaseUrl,
      },
    ];
    const enabled = { "opencode-go": ["mimo-v2.5", "glm-5.1"] };
    const apiKeys = { "opencode-go": "sk-test" };

    const visionModels = getConfiguredVisionModels(
      enabled,
      undefined,
      customProviders,
      apiKeys,
    );

    expect(visionModels.some(({ model }) => model.id === "mimo-v2.5")).toBe(true);
    expect(visionModels.some(({ model }) => model.id === "glm-5.1")).toBe(false);
    expect(visionModels.some(({ provider }) => provider.id === "openai")).toBe(false);
  });

  it("excludes vision models when provider has no API key", () => {
    const enabled = { openai: ["gpt-5.4"] };
    const visionModels = getConfiguredVisionModels(enabled, undefined, undefined, {});

    expect(visionModels).toHaveLength(0);
  });

  it("marks OpenCode Go vision conservatively from runtime evidence", () => {
    const mimo = opencodeGoPreset.models.find((m) => m.id === "mimo-v2.5");
    const glm = opencodeGoPreset.models.find((m) => m.id === "glm-5.1");
    expect(modelSupportsVision(mimo)).toBe(true);
    expect(modelSupportsVision(glm)).toBe(false);
  });
});
