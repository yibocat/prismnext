import { describe, expect, it } from "vitest";
import {
  activitySpanSecFromBlocks,
  durationSecFromOpenCodePart,
  durationSecFromOpenCodeTime,
} from "../../src/shared/chat/block-time";

describe("durationSecFromOpenCodeTime", () => {
  it("computes seconds from start/end ms", () => {
    expect(durationSecFromOpenCodeTime({ start: 1_000, end: 4_500 })).toBe(3.5);
  });

  it("returns undefined when end is missing", () => {
    expect(durationSecFromOpenCodeTime({ start: 1_000 })).toBeUndefined();
  });
});

describe("durationSecFromOpenCodePart", () => {
  it("reads tool state.time", () => {
    expect(
      durationSecFromOpenCodePart({
        type: "tool",
        state: { status: "completed", time: { start: 10_000, end: 12_000 } },
      }),
    ).toBe(2);
  });

  it("reads reasoning part.time", () => {
    expect(
      durationSecFromOpenCodePart({
        type: "reasoning",
        time: { start: 0, end: 1500 },
      }),
    ).toBe(1.5);
  });
});

describe("activitySpanSecFromBlocks", () => {
  it("uses earliest start and latest end", () => {
    expect(
      activitySpanSecFromBlocks([
        { timeStart: 1000, timeEnd: 2000 },
        { timeStart: 2500, timeEnd: 5000 },
      ]),
    ).toBe(4);
  });
});
