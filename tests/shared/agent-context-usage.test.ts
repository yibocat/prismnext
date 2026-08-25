import { describe, expect, it } from "vitest";
import {
  breakdownTotal,
  contextBarSegments,
  estimateCostUsd,
  fitBreakdownToOccupancy,
  occupancyExceedsWindow,
  occupancyFromPiUsage,
  usageTotalsFromTurns,
} from "../../src/shared/agent/context-usage";

describe("occupancyFromPiUsage", () => {
  it("prefers totalTokens when present", () => {
    expect(occupancyFromPiUsage({ totalTokens: 900, input: 1, output: 1 })).toBe(900);
  });

  it("sums input, output, and cache otherwise", () => {
    expect(occupancyFromPiUsage({
      input: 100,
      output: 20,
      cacheRead: 5,
      cacheWrite: 3,
    })).toBe(128);
  });

  it("treats all-zero usage as unknown, not an empty window", () => {
    expect(occupancyFromPiUsage({ input: 0, output: 0 })).toBeNull();
    expect(occupancyFromPiUsage({})).toBeNull();
  });
});

describe("fitBreakdownToOccupancy", () => {
  it("puts the remainder in conversation when occupancy is larger than static buckets", () => {
    const fitted = fitBreakdownToOccupancy({
      systemPrompt: 100,
      tools: 50,
      conversation: 9999,
    }, 400);
    expect(fitted.systemPrompt).toBe(100);
    expect(fitted.tools).toBe(50);
    expect(fitted.conversation).toBe(250);
    expect(breakdownTotal(fitted)).toBe(400);
  });

  it("scales static buckets down when they exceed occupancy", () => {
    const fitted = fitBreakdownToOccupancy({
      systemPrompt: 80,
      tools: 20,
    }, 50);
    expect(breakdownTotal(fitted)).toBe(50);
    expect(fitted.conversation).toBeUndefined();
  });
});

describe("usageTotalsFromTurns", () => {
  it("uses the last occupancy and sums per-turn spend", () => {
    const totals = usageTotalsFromTurns([
      { usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.01 } },
      { usage: { inputTokens: 250, outputTokens: 20, costUsd: 0.02 } },
    ]);
    expect(totals?.occupancyTokens).toBe(250);
    expect(totals?.costUsd).toBeCloseTo(0.03);
  });
});

describe("contextBarSegments", () => {
  it("sizes segments against the full window, not consumed total", () => {
    const segs = contextBarSegments({
      systemPrompt: 2900,
      tools: 4000,
      skills: 352,
      subagents: 267,
      conversation: 4200,
    }, 11_600, 1_000_000);
    const fill = segs.reduce((sum, seg) => sum + seg.widthPct, 0);
    expect(fill).toBeCloseTo(1.1719, 3);
    expect(fill).toBeLessThan(2);
    expect(segs.find((seg) => seg.key === "conversation")?.widthPct).toBeCloseTo(0.42, 2);
  });

  it("falls back to occupancy as one conversation segment", () => {
    const segs = contextBarSegments(null, 11_600, 1_000_000);
    expect(segs).toEqual([
      { key: "conversation", tokens: 11_600, widthPct: 1.16 },
    ]);
  });
});

describe("occupancyExceedsWindow", () => {
  it("is true only when occupancy is larger than a known window", () => {
    expect(occupancyExceedsWindow(90_000, 32_000)).toBe(true);
    expect(occupancyExceedsWindow(32_000, 32_000)).toBe(false);
    expect(occupancyExceedsWindow(10, 32_000)).toBe(false);
    expect(occupancyExceedsWindow(null, 32_000)).toBe(false);
    expect(occupancyExceedsWindow(90_000, 0)).toBe(false);
  });
});

describe("estimateCostUsd", () => {
  it("applies catalog rates as USD per million tokens", () => {
    expect(estimateCostUsd(
      { input: 1_000_000, output: 500_000, cacheRead: 0, cacheWrite: 0 },
      { input: 0.15, output: 0.6 },
    )).toBeCloseTo(0.45);
  });
});
