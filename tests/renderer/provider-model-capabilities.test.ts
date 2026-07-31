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
    const customModels = {
      "opencode-go": [
        {
          id: "mimo-v2.5",
          name: "MiMo V2.5",
          contextWindow: "256K",
          capabilities: { vision: true },
        },
        {
          id: "glm-5.1",
          name: "GLM-5.1",
          contextWindow: "200K",
          capabilities: { vision: false },
        },
      ],
    };

    const visionModels = getConfiguredVisionModels(
      enabled,
      customModels,
      customProviders,
      apiKeys,
    );

    expect(visionModels.some(({ model }) => model.id === "mimo-v2.5")).toBe(true);
    expect(visionModels.some(({ model }) => model.id === "glm-5.1")).toBe(false);
    expect(visionModels.some(({ provider }) => provider.id === "openai")).toBe(false);
  });

  it("excludes vision models when provider has no API key", () => {
    const enabled = { openai: ["gpt-5.4"] };
    const customProviders = [
      { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com" },
    ];
    const visionModels = getConfiguredVisionModels(
      enabled,
      {
        openai: [
          {
            id: "gpt-5.4",
            name: "GPT-5.4",
            contextWindow: "400K",
            capabilities: { vision: true },
          },
        ],
      },
      customProviders,
      {},
    );

    expect(visionModels).toHaveLength(0);
  });

  it("reads vision from selection snapshots when presets have no models", () => {
    expect(opencodeGoPreset.models).toEqual([]);
    const mimo = {
      id: "mimo-v2.5",
      name: "MiMo V2.5",
      contextWindow: "256K",
      capabilities: { vision: true },
    };
    const glm = {
      id: "glm-5.1",
      name: "GLM-5.1",
      contextWindow: "200K",
    };
    expect(modelSupportsVision(mimo)).toBe(true);
    expect(modelSupportsVision(glm)).toBe(false);
  });
});
