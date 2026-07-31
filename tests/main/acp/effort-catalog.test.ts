import { describe, expect, it } from "vitest";
import {
  EffortCatalog,
  buildEffortMapFromModelsDevCache,
  buildEffortMapFromProvidersList,
} from "../../../src/main/acp/effort-catalog";

describe("effort-catalog", () => {
  it("buildEffortMapFromModelsDevCache parses reasoning_options", () => {
    const map = buildEffortMapFromModelsDevCache({
      "opencode-go": {
        id: "opencode-go",
        models: {
          "deepseek-v4-pro": {
            reasoning_options: [{ type: "effort", values: ["high", "max"] }],
          },
          "minimax-m3": {
            reasoning_options: [{ type: "toggle" }],
          },
          "glm-5.1": { reasoning_options: [] },
        },
      },
      anthropic: {
        id: "anthropic",
        models: {
          "claude-sonnet-4-6": {
            reasoning_options: [
              { type: "effort", values: ["low", "medium", "high", "max"] },
            ],
          },
        },
      },
    });
    expect(map.get("opencode-go/deepseek-v4-pro")).toEqual(["high", "max"]);
    expect(map.get("opencode-go/minimax-m3")).toEqual(["none", "thinking"]);
    expect(map.has("opencode-go/glm-5.1")).toBe(false);
    expect(map.get("anthropic/claude-sonnet-4-6")).toEqual([
      "low",
      "medium",
      "high",
      "max",
    ]);
  });

  it("buildEffortMapFromProvidersList parses variantsByModel index", () => {
    const map = buildEffortMapFromProvidersList({
      providers: [],
      variantsByModel: {
        "opencode-go/deepseek-v4-pro": { high: {}, max: {} },
        "opencode-go/glm-5.1": {},
        "opencode/claude-sonnet-4-6": { low: {}, high: {} },
      },
    });
    expect(map.get("opencode-go/deepseek-v4-pro")).toEqual(["high", "max"]);
    expect(map.has("opencode-go/glm-5.1")).toBe(false);
    expect(map.get("opencode-zen/claude-sonnet-4-6")).toEqual(["low", "high"]);
  });

  it("buildEffortMapFromProvidersList parses array-shaped providers", () => {
    const map = buildEffortMapFromProvidersList({
      providers: [
        {
          id: "opencode-go",
          models: [
            { id: "deepseek-v4-pro", variants: { high: {}, max: {} } },
            { id: "glm-5.1", variants: {} },
          ],
        },
        {
          id: "opencode",
          models: [{ id: "claude-sonnet-4-5", variants: { low: {}, high: {} } }],
        },
      ],
    });
    expect(map.get("opencode-go/deepseek-v4-pro")).toEqual(["high", "max"]);
    expect(map.has("opencode-go/glm-5.1")).toBe(false);
    expect(map.get("opencode-zen/claude-sonnet-4-5")).toEqual(["low", "high"]);
  });

  it("ingestConfigOptions updates and clears per model", () => {
    const catalog = new EffortCatalog();
    catalog.ingestConfigOptions("opencode-go", "minimax-m3", [
      {
        id: "effort",
        options: [
          { value: "default" },
          { value: "none" },
          { value: "thinking" },
        ],
      },
    ]);
    expect(catalog.getEfforts("opencode-go", "minimax-m3")).toEqual([
      "none",
      "thinking",
    ]);

    catalog.ingestConfigOptions("opencode-go", "minimax-m3", []);
    expect(catalog.getEfforts("opencode-go", "minimax-m3")).toBeUndefined();
  });

  it("validateEffort rejects unknown values", () => {
    const catalog = new EffortCatalog();
    catalog.ingestProvidersList({
      providers: [
        {
          id: "opencode-go",
          models: [{ id: "deepseek-v4-pro", variants: { high: {}, max: {} } }],
        },
      ],
    });
    expect(
      catalog.validateEffort("opencode-go", "deepseek-v4-pro", "max"),
    ).toBe("max");
    expect(
      catalog.validateEffort("opencode-go", "deepseek-v4-pro", "low"),
    ).toBeUndefined();
  });

  it("resolveModelEffort falls back to preset list when cache miss", () => {
    const catalog = new EffortCatalog();
    const result = catalog.resolveModelEffort("anthropic", "claude", ["high"]);
    expect(result).toEqual({ efforts: ["high"], source: "fallback" });
  });
});
