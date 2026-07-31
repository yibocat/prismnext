import { describe, expect, it } from "vitest";
import {
  migrateAnthropicEnabledModelIds,
  normalizeAnthropicModelId,
} from "../../src/shared/anthropic-models";
import {
  migrateGoogleEnabledModelIds,
  normalizeGoogleModelId,
} from "../../src/shared/google-models";
import { normalizeOpenCodeModelId } from "../../src/shared/opencode-provider";
import { openaiProvider } from "../../src/renderer/lib/providers/presets/openai";
import { anthropicPreset } from "../../src/renderer/lib/providers/presets/anthropic";
import { googleProvider } from "../../src/renderer/lib/providers/presets/google";

describe("provider model id aliases", () => {
  it("normalizes Google preview aliases", () => {
    expect(normalizeGoogleModelId("gemini-3.1-pro")).toBe("gemini-3.1-pro-preview");
    expect(normalizeGoogleModelId("gemini-3-flash")).toBe("gemini-3-flash-preview");
    expect(migrateGoogleEnabledModelIds(["gemini-3.1-pro", "gemini-3.5-flash"])).toEqual([
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
    ]);
    expect(normalizeOpenCodeModelId("google", "gemini-3.1-pro")).toBe(
      "gemini-3.1-pro-preview",
    );
  });

  it("normalizes Anthropic dated snapshots to latest aliases", () => {
    expect(normalizeAnthropicModelId("claude-sonnet-4-5-20250929")).toBe(
      "claude-sonnet-4-5",
    );
    expect(normalizeAnthropicModelId("claude-haiku-4-5-20251001")).toBe(
      "claude-haiku-4-5",
    );
    expect(
      migrateAnthropicEnabledModelIds([
        "claude-sonnet-4-5-20250929",
        "claude-sonnet-4-6",
      ]),
    ).toEqual(["claude-sonnet-4-5", "claude-sonnet-4-6"]);
    expect(
      normalizeOpenCodeModelId("anthropic", "claude-sonnet-4-5-20250929"),
    ).toBe("claude-sonnet-4-5");
  });

  it("keeps OpenAI / Anthropic / Google presets empty (lazy catalog)", () => {
    expect(openaiProvider.models).toEqual([]);
    expect(anthropicPreset.models).toEqual([]);
    expect(googleProvider.models).toEqual([]);
  });
});
