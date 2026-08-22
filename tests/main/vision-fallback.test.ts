import { describe, expect, it, vi } from "vitest";

const settingsState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
  },
}));

vi.mock("../../src/main/app/settings", () => ({
  getSettings: () => settingsState.current,
}));

vi.mock("../../src/main/app/logger", () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import {
  normalizeVisionBaseUrl,
  parseVisionHelperModelRef,
  resolveAnthropicMessagesUrl,
  resolveVisionHelperFromSettings,
  usesAnthropicMessagesApi,
} from "../../src/main/agent/vision-fallback";

describe("vision-fallback URL routing", () => {
  it("routes OpenCode Go MiniMax/Qwen to Anthropic messages API", () => {
    expect(usesAnthropicMessagesApi("opencode-go", "minimax-m3")).toBe(true);
    expect(usesAnthropicMessagesApi("opencode-go", "qwen3.6-plus")).toBe(true);
    expect(usesAnthropicMessagesApi("opencode-go", "mimo-v2.5")).toBe(false);
    expect(usesAnthropicMessagesApi("opencode-go", "kimi-k2.6")).toBe(false);
  });

  it("builds messages URL without doubling /v1 for OpenCode roots", () => {
    expect(resolveAnthropicMessagesUrl("https://opencode.ai/zen/go/v1")).toBe(
      "https://opencode.ai/zen/go/v1/messages",
    );
    expect(resolveAnthropicMessagesUrl("https://api.anthropic.com")).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  it("normalizes OpenCode base URLs to end with /v1", () => {
    expect(normalizeVisionBaseUrl("opencode-go", "https://opencode.ai/zen/go")).toBe(
      "https://opencode.ai/zen/go/v1",
    );
    expect(normalizeVisionBaseUrl("opencode-go", "https://opencode.ai/zen/go/v1/")).toBe(
      "https://opencode.ai/zen/go/v1",
    );
  });
});

describe("vision helper settings resolver", () => {
  it("parses provider/model refs", () => {
    expect(parseVisionHelperModelRef("openai/gpt-4o")).toEqual({
      providerId: "openai",
      modelId: "gpt-4o",
    });
    expect(parseVisionHelperModelRef(" opencode-go/kimi-k2.6 ")).toEqual({
      providerId: "opencode-go",
      modelId: "kimi-k2.6",
    });
    // First slash splits; model ids may contain slashes.
    expect(parseVisionHelperModelRef("openrouter/vendor/model")).toEqual({
      providerId: "openrouter",
      modelId: "vendor/model",
    });
  });

  it("rejects missing or malformed refs", () => {
    expect(parseVisionHelperModelRef(undefined)).toBeNull();
    expect(parseVisionHelperModelRef(null)).toBeNull();
    expect(parseVisionHelperModelRef("")).toBeNull();
    expect(parseVisionHelperModelRef("   ")).toBeNull();
    expect(parseVisionHelperModelRef("noslash")).toBeNull();
    expect(parseVisionHelperModelRef("openai/")).toBeNull();
    expect(parseVisionHelperModelRef("/gpt-4o")).toBeNull();
  });

  it("resolves the helper from settings.aiVisionFallbackModel", () => {
    settingsState.current = {};
    expect(resolveVisionHelperFromSettings()).toBeNull();

    settingsState.current = { aiVisionFallbackModel: null };
    expect(resolveVisionHelperFromSettings()).toBeNull();

    settingsState.current = { aiVisionFallbackModel: "anthropic/claude-sonnet-4" };
    expect(resolveVisionHelperFromSettings()).toEqual({
      providerId: "anthropic",
      modelId: "claude-sonnet-4",
    });
    settingsState.current = {};
  });
});
