import { describe, expect, it } from "vitest";
import {
  buildGoModelVariants,
  buildOpenCodeGoEffortPatch,
  budgetVariantSettings,
  mergeOpenCodeGoEffortIntoConfig,
  variantSettingsForEffort,
} from "../../src/shared/opencode-go-effort-variants";

describe("opencode-go-effort-variants", () => {
  it("buildGoModelVariants maps effort reasoning_options for openai-compatible", () => {
    const variants = buildGoModelVariants(
      {
        reasoning: true,
        reasoning_options: [{ type: "effort", values: ["high", "max"] }],
      },
      "@ai-sdk/openai-compatible",
    );
    expect(variants).toEqual({
      high: { reasoningEffort: "high" },
      max: { reasoningEffort: "max" },
    });
  });

  it("buildGoModelVariants maps toggle for anthropic npm models", () => {
    const variants = buildGoModelVariants(
      {
        provider: { npm: "@ai-sdk/anthropic" },
        reasoning_options: [{ type: "toggle" }],
      },
      "@ai-sdk/openai-compatible",
    );
    expect(variants).toEqual({
      none: { thinking: { type: "disabled" } },
      thinking: { thinking: { type: "adaptive", display: "summarized" } },
    });
  });

  it("buildGoModelVariants maps budget_tokens for anthropic npm models", () => {
    const variants = buildGoModelVariants(
      {
        provider: { npm: "@ai-sdk/anthropic" },
        reasoning_options: [{ type: "budget_tokens", max: 81920 }],
      },
      "@ai-sdk/openai-compatible",
    );
    expect(variants).toEqual({
      high: { thinking: { type: "enabled", budgetTokens: 40960 } },
      max: { thinking: { type: "enabled", budgetTokens: 81920 } },
    });
  });

  it("budgetVariantSettings uses reasoningEffort for openai-compatible npm", () => {
    expect(budgetVariantSettings("@ai-sdk/openai-compatible", 81920)).toEqual({
      high: { reasoningEffort: "high" },
      max: { reasoningEffort: "max" },
    });
  });

  it("buildOpenCodeGoEffortPatch reads opencode-go section", () => {
    const patch = buildOpenCodeGoEffortPatch({
      npm: "@ai-sdk/openai-compatible",
      models: {
        "glm-5.2": {
          reasoning_options: [{ type: "effort", values: ["high", "max"] }],
        },
        "glm-5.1": { reasoning_options: [] },
      },
    });
    expect(Object.keys(patch)).toEqual(["glm-5.2"]);
    expect(patch["glm-5.2"]?.variants.max).toEqual({ reasoningEffort: "max" });
  });

  it("mergeOpenCodeGoEffortIntoConfig is non-destructive", () => {
    const { config, changed } = mergeOpenCodeGoEffortIntoConfig(
      {
        $schema: "https://opencode.ai/config.json",
        provider: {
          "opencode-go": {
            models: {
              "glm-5.2": {
                variants: { high: { reasoningEffort: "high" } },
              },
            },
          },
        },
      },
      {
        "glm-5.2": {
          variants: {
            high: { reasoningEffort: "high" },
            max: { reasoningEffort: "max" },
          },
        },
      },
    );
    expect(changed).toBe(true);
    const models = (config.provider as Record<string, unknown>)["opencode-go"] as {
      models: Record<string, { variants: Record<string, unknown> }>;
    };
    expect(Object.keys(models.models["glm-5.2"].variants)).toEqual(["high", "max"]);
  });

  it("variantSettingsForEffort uses reasoningEffort for openai npm", () => {
    expect(variantSettingsForEffort("@ai-sdk/openai", "medium")).toEqual({
      reasoningEffort: "medium",
    });
  });
});
