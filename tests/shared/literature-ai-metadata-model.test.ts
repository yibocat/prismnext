import { describe, expect, it } from "vitest";
import {
  isLiteratureAiMetadataConfigured,
  resolveLiteratureAiMetadataModel,
} from "../../src/shared/literature/ai-metadata-model";

describe("literature-ai-metadata-model", () => {
  it("returns null when provider and model are unset (no openai default)", () => {
    expect(resolveLiteratureAiMetadataModel({})).toBeNull();
    expect(resolveLiteratureAiMetadataModel({ aiProvider: "openai" })).toBeNull();
  });

  it("uses explicit literatureAiMetadataModel when set", () => {
    expect(
      resolveLiteratureAiMetadataModel({ literatureAiMetadataModel: "anthropic/claude-sonnet-4" }),
    ).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4",
      modelKey: "anthropic/claude-sonnet-4",
    });
  });

  it("uses Settings → AI provider and model when both set", () => {
    expect(
      resolveLiteratureAiMetadataModel({ aiProvider: "deepseek", aiModel: "deepseek-chat" }),
    ).toEqual({
      provider: "deepseek",
      model: "deepseek-chat",
      modelKey: "deepseek/deepseek-chat",
    });
  });

  it("is configured only when model resolves and API key exists", () => {
    expect(
      isLiteratureAiMetadataConfigured({
        aiProvider: "openai",
        aiModel: "gpt-4o-mini",
        aiApiKeys: {},
      }),
    ).toBe(false);
    expect(
      isLiteratureAiMetadataConfigured({
        aiProvider: "openai",
        aiModel: "gpt-4o-mini",
        aiApiKeys: { openai: "sk-test" },
      }),
    ).toBe(true);
  });
});
