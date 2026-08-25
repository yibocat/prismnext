import { describe, expect, it } from "vitest";
import {
  migrateOpenRouterEnabledModelIds,
  migrateOpenRouterPreferenceKey,
  normalizeOpenRouterModelId,
  parseOpenRouterApiModels,
} from "../../src/shared/providers/openrouter-models";

describe("openrouter-models", () => {
  it("normalizes legacy hyphen Anthropic / gemini IDs", () => {
    expect(normalizeOpenRouterModelId("anthropic/claude-sonnet-4-6")).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(normalizeOpenRouterModelId("anthropic/claude-opus-4-8")).toBe(
      "anthropic/claude-opus-4.8",
    );
    expect(normalizeOpenRouterModelId("anthropic/claude-sonnet-4-5")).toBe(
      "anthropic/claude-sonnet-4.5",
    );
    expect(normalizeOpenRouterModelId("google/gemini-3.1-pro")).toBe(
      "google/gemini-3.1-pro-preview",
    );
    expect(normalizeOpenRouterModelId("openai/gpt-5.5")).toBe("openai/gpt-5.5");
  });

  it("migrates enabled id lists and preference keys", () => {
    expect(
      migrateOpenRouterEnabledModelIds([
        "anthropic/claude-sonnet-4-6",
        "openai/gpt-5.5",
        "anthropic/claude-sonnet-4.6",
      ]),
    ).toEqual(["anthropic/claude-sonnet-4.6", "openai/gpt-5.5"]);
    expect(
      migrateOpenRouterPreferenceKey("openrouter/anthropic/claude-opus-4-8"),
    ).toBe("openrouter/anthropic/claude-opus-4.8");
  });

  it("parses OpenRouter API model list", () => {
    const rows = parseOpenRouterApiModels({
      data: [
        {
          id: "anthropic/claude-sonnet-4.6",
          name: "Anthropic: Claude Sonnet 4.6",
          description:
            "Sonnet 4.6 is Anthropic's most capable Sonnet-class model yet",
          context_length: 1_000_000,
          architecture: { input_modalities: ["text", "image"] },
        },
        {
          id: "openrouter/auto",
          name: "Auto",
          context_length: 200_000,
        },
        {
          id: "deepseek/deepseek-v4-pro",
          name: "DeepSeek V4 Pro",
          context_length: 1_048_576,
          architecture: { input_modalities: ["text"] },
        },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual([
      "anthropic/claude-sonnet-4.6",
      "deepseek/deepseek-v4-pro",
    ]);
    expect(rows[0]?.contextWindow).toBe("1M");
    expect(rows[0]?.capabilities?.vision).toBe(true);
    expect(rows[0]?.description).toContain("Sonnet 4.6");
    expect(rows[1]?.capabilities?.vision).toBe(false);
  });
});
