import { describe, expect, it } from "vitest";
import {
  mapAcpUsageToSnake,
  parseAcpUsageUpdate,
  resolveContextUsedFromPromptUsage,
} from "../../src/shared/agent/session-context-usage";

describe("parseAcpUsageUpdate", () => {
  it("parses flattened usage_update", () => {
    expect(
      parseAcpUsageUpdate({
        sessionUpdate: "usage_update",
        used: 12043,
        size: 131072,
        cost: { amount: 0.01, currency: "USD" },
      }),
    ).toEqual({
      used: 12043,
      size: 131072,
      cost: { amount: 0.01, currency: "USD" },
    });
  });

  it("parses wrapped update bag", () => {
    expect(
      parseAcpUsageUpdate({
        update: { sessionUpdate: "usage_update", used: 10, size: 200000 },
      }),
    ).toEqual({ used: 10, size: 200000, cost: undefined });
  });

  it("rejects missing size or used", () => {
    expect(parseAcpUsageUpdate({ sessionUpdate: "usage_update", used: 1 })).toBeNull();
    expect(parseAcpUsageUpdate({ sessionUpdate: "tool_call", used: 1, size: 2 })).toBeNull();
  });
});

describe("resolveContextUsedFromPromptUsage", () => {
  it("prefers totalTokens over input+cache", () => {
    expect(
      resolveContextUsedFromPromptUsage({
        totalTokens: 12115,
        inputTokens: 55,
        cachedReadTokens: 11988,
        outputTokens: 72,
      }),
    ).toBe(12115);
  });

  it("falls back to input + cache fields", () => {
    expect(
      resolveContextUsedFromPromptUsage({
        inputTokens: 55,
        cachedReadTokens: 11988,
        cachedWriteTokens: 0,
      }),
    ).toBe(12043);
  });

  it("reads snake_case aliases", () => {
    expect(
      resolveContextUsedFromPromptUsage({
        input_tokens: 100,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 25,
      }),
    ).toBe(175);
  });

  it("returns null when empty", () => {
    expect(resolveContextUsedFromPromptUsage({})).toBeNull();
    expect(resolveContextUsedFromPromptUsage(null)).toBeNull();
  });
});

describe("mapAcpUsageToSnake", () => {
  it("maps camelCase ACP usage", () => {
    expect(
      mapAcpUsageToSnake({
        inputTokens: 1,
        outputTokens: 2,
        cachedWriteTokens: 3,
        cachedReadTokens: 4,
        totalTokens: 10,
        thoughtTokens: 5,
      }),
    ).toEqual({
      input_tokens: 1,
      output_tokens: 2,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 4,
      total_tokens: 10,
      thought_tokens: 5,
    });
  });
});
