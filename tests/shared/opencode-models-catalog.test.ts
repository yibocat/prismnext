import { describe, expect, it } from "vitest";
import {
  buildModelsCatalogFromModelsDevCache,
  catalogModelSupportsVision,
  formatCatalogContextWindow,
} from "../../src/shared/opencode-models-catalog";

describe("opencode-models-catalog", () => {
  it("formatCatalogContextWindow formats token limits", () => {
    expect(formatCatalogContextWindow(1_000_000)).toBe("1M");
    expect(formatCatalogContextWindow(256_000)).toBe("256K");
    expect(formatCatalogContextWindow(undefined)).toBe("Unknown");
  });

  it("catalogModelSupportsVision detects image/video input", () => {
    expect(catalogModelSupportsVision({ input: ["text", "image"] })).toBe(true);
    expect(catalogModelSupportsVision({ input: ["text"] })).toBe(false);
  });

  it("buildModelsCatalogFromModelsDevCache parses opencode-go section", () => {
    const entries = buildModelsCatalogFromModelsDevCache({
      "opencode-go": {
        id: "opencode-go",
        models: {
          "glm-5.2": {
            id: "glm-5.2",
            name: "GLM-5.2",
            limit: { context: 1_000_000 },
            modalities: { input: ["text"] },
            description: "Flagship GLM",
          },
          "grok-4.5": {
            id: "grok-4.5",
            name: "Grok 4.5",
            limit: { context: 500_000 },
            modalities: { input: ["text", "image"] },
          },
        },
      },
    });
    expect(entries["opencode-go"]?.map((m) => m.id).sort()).toEqual([
      "glm-5.2",
      "grok-4.5",
    ]);
    const grok = entries["opencode-go"]?.find((m) => m.id === "grok-4.5");
    expect(grok?.contextWindow).toBe("500K");
    expect(grok?.capabilities?.vision).toBe(true);
  });

  it("skips deprecated models (OpenCode rejects them at set_model)", () => {
    const entries = buildModelsCatalogFromModelsDevCache({
      opencode: {
        id: "opencode",
        models: {
          "hy3-free": {
            id: "hy3-free",
            name: "Hy3 Free",
            status: "deprecated",
            limit: { context: 200_000 },
            modalities: { input: ["text"] },
          },
          "big-pickle": {
            id: "big-pickle",
            name: "Big Pickle",
            limit: { context: 200_000 },
            modalities: { input: ["text"] },
          },
        },
      },
    });
    expect(entries["opencode-zen"]?.map((m) => m.id)).toEqual(["big-pickle"]);
  });
});
