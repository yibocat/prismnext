import { describe, expect, it } from "vitest";
import { resolveModelsListUrl } from "../../src/main/agent/model-catalog";

describe("resolveModelsListUrl", () => {
  it("does not double /v1 for OpenCode Zen/Go bases", () => {
    expect(resolveModelsListUrl("https://opencode.ai/zen/v1")).toBe(
      "https://opencode.ai/zen/v1/models",
    );
    expect(resolveModelsListUrl("https://opencode.ai/zen/go/v1")).toBe(
      "https://opencode.ai/zen/go/v1/models",
    );
    expect(resolveModelsListUrl("https://opencode.ai/zen/v1/")).toBe(
      "https://opencode.ai/zen/v1/models",
    );
  });

  it("appends /v1/models when base has no version suffix", () => {
    expect(resolveModelsListUrl("https://api.openai.com")).toBe(
      "https://api.openai.com/v1/models",
    );
    expect(resolveModelsListUrl("https://api.deepseek.com/")).toBe(
      "https://api.deepseek.com/v1/models",
    );
  });
});
