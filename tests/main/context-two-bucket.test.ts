import { describe, expect, it } from "vitest";
import { buildTwoBucketBreakdown } from "../../src/main/services/context-constants";

describe("buildTwoBucketBreakdown", () => {
  it("splits used into prism-side and session-rest", () => {
    expect(buildTwoBucketBreakdown(51789, 3473)).toEqual({
      "prism-side": 3473,
      "session-rest": 48316,
    });
  });

  it("clamps prism above used into rest 0", () => {
    expect(buildTwoBucketBreakdown(100, 150)).toEqual({
      "prism-side": 150,
      "session-rest": 0,
    });
  });

  it("handles zero used", () => {
    expect(buildTwoBucketBreakdown(0, 0)).toEqual({
      "prism-side": 0,
      "session-rest": 0,
    });
  });
});
