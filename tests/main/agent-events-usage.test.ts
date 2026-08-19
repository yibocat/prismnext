import { describe, expect, it } from "vitest";
import { mapPiSessionEvent } from "../../src/main/agent/events";

const ctx = { runtimeSessionId: "rt-1", tabId: "tab-1", turnId: "turn-1" };

describe("mapPiSessionEvent usage", () => {
  it("maps occupancy as input+output+cache, not billed-input alone", () => {
    const events = mapPiSessionEvent({
      type: "message_update",
      usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 3, cost: { total: 0.02 } },
    }, ctx);
    expect(events).toEqual([
      expect.objectContaining({
        type: "usage_updated",
        inputTokens: 128,
        outputTokens: 20,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
        costUsd: 0.02,
      }),
    ]);
  });

  it("does not emit occupancy zero as a filled window", () => {
    const empty = mapPiSessionEvent({
      type: "message_update",
      usage: { input: 0, output: 0 },
    }, ctx);
    expect(empty).toEqual([]);

    const costOnly = mapPiSessionEvent({
      usage: { cost: { total: 0.01 } },
    }, ctx);
    expect(costOnly[0]).toMatchObject({ type: "usage_updated", costUsd: 0.01 });
    expect(costOnly[0]).not.toHaveProperty("inputTokens");
  });
});
