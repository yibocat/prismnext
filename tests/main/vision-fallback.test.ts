import { describe, expect, it, vi } from "vitest";

vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
  },
}));

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => ({}),
}));

vi.mock("../../src/main/services/logger", () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import {
  normalizeVisionBaseUrl,
  resolveAnthropicMessagesUrl,
  usesAnthropicMessagesApi,
} from "../../src/main/services/vision-fallback";

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
