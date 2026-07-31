import { describe, it, expect } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  segmentAssistantBlocks,
  coalesceActivitySegments,
  buildActivitySummaryLine,
  describeLatestActivityBlock,
  countActivityTools,
  formatActivityDuration,
} from "../../src/renderer/lib/chat/segment-assistant-blocks";

const labels = {
  working: "Working…",
  thinking: "Thinking…",
  thoughtFor: (d: string) => `Thought for ${d}`,
  workedFor: (d: string, n: number) =>
    n > 0 ? `Worked for ${d} · ${n} tools` : `Worked for ${d}`,
};

describe("segmentAssistantBlocks", () => {
  it("groups consecutive thinking and tools into activity segments", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "read", input: { file_path: "main.tex" } },
      { type: "text", text: "Here is the answer." },
      { type: "thinking", thinking: "check" },
      { type: "tool_use", id: "t2", name: "grep", input: { pattern: "cite" } },
      { type: "text", text: "More answer." },
    ];
    const segments = segmentAssistantBlocks(blocks);
    expect(segments).toHaveLength(4);
    expect(segments[0]).toMatchObject({ kind: "activity", blockIndices: [0, 1] });
    expect(segments[1]).toMatchObject({ kind: "text", blockIndex: 2 });
    expect(segments[2]).toMatchObject({ kind: "activity", blockIndices: [3, 4] });
    expect(segments[3]).toMatchObject({ kind: "text", blockIndex: 5 });
  });

  it("merges activity across tiny filler prose", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      { type: "text", text: "ok" },
      { type: "tool_use", id: "t2", name: "grep" },
      { type: "text", text: "Final report with enough length to stay visible as prose in the chat." },
    ];
    const segments = segmentAssistantBlocks(blocks);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.kind).toBe("activity");
    if (segments[0]?.kind === "activity") {
      expect(segments[0].blocks.filter((b) => b.type === "tool_use")).toHaveLength(2);
    }
  });

  it("ignores empty text blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "glob", input: { pattern: "**/*.tex" } },
      { type: "text", text: "   " },
      { type: "text", text: "Done." },
    ];
    const segments = segmentAssistantBlocks(blocks);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.kind).toBe("activity");
    expect(segments[1]).toMatchObject({ kind: "text", blockIndex: 2 });
  });

  it("unified: one activity fold until trailing prose", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      { type: "text", text: "Checking the repo layout first." },
      { type: "tool_use", id: "t2", name: "grep" },
      { type: "text", text: "Final answer streaming…" },
    ];
    const segments = segmentAssistantBlocks(blocks, { unifiedActivity: true });
    expect(segments).toHaveLength(2);
    expect(segments[0]?.kind).toBe("activity");
    if (segments[0]?.kind === "activity") {
      expect(segments[0].blocks.filter((b) => b.type === "tool_use")).toHaveLength(2);
      expect(segments[0].blocks.some((b) => b.type === "text")).toBe(true);
    }
    expect(segments[1]).toMatchObject({ kind: "text", blockIndex: 3 });
  });

  it("unified: activity only when no trailing prose yet", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "bash" },
      { type: "tool_use", id: "t2", name: "glob" },
    ];
    const segments = segmentAssistantBlocks(blocks, { unifiedActivity: true });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("activity");
  });

  it("unified: suppressTailUntilTaskSettled keeps interim prose in activity", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "task1", name: "task", input: { subagent_type: "explore" } },
      { type: "text", text: "Premature answer before Task settles." },
    ];
    const segments = segmentAssistantBlocks(blocks, {
      unifiedActivity: true,
      suppressTailUntilTaskSettled: true,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("activity");
    if (segments[0]?.kind === "activity") {
      expect(segments[0].blocks.some((b) => b.type === "text")).toBe(true);
    }
  });
});

describe("describeLatestActivityBlock", () => {
  it("summarizes read and bash tools", () => {
    expect(
      describeLatestActivityBlock({
        type: "tool_use",
        name: "read",
        input: { file_path: "src/main/foo.ts" },
      }),
    ).toBe("foo.ts");
    expect(
      describeLatestActivityBlock({
        type: "tool_use",
        name: "bash",
        input: { command: "pnpm test" },
      }),
    ).toBe("pnpm test");
  });
});

describe("buildActivitySummaryLine", () => {
  it("shows streaming working hint with last tool", () => {
    const line = buildActivitySummaryLine({
      blocks: [
        { type: "tool_use", id: "1", name: "read", input: { file_path: "a.tex" } },
      ],
      isStreaming: true,
      labels,
    });
    expect(line).toContain("Working…");
    expect(line).toContain("a.tex");
  });

  it("shows completed worked-for with tool count", () => {
    const line = buildActivitySummaryLine({
      blocks: [
        { type: "thinking", thinking: "x", duration: 2 },
        { type: "tool_use", id: "1", name: "read", duration: 1 },
        { type: "tool_use", id: "2", name: "grep", duration: 1.5 },
      ],
      isStreaming: false,
      labels,
    });
    expect(line).toContain("Worked for");
    expect(line).toContain("2 tools");
    expect(line).toContain("4.5s");
  });

  it("uses thought-for when only thinking blocks", () => {
    const line = buildActivitySummaryLine({
      blocks: [{ type: "thinking", thinking: "hmm", duration: 4.2 }],
      isStreaming: false,
      labels,
    });
    expect(line).toBe("Thought for 4.2s");
  });

  it("completed thinking-only never keeps live Thinking… when duration is missing", () => {
    const line = buildActivitySummaryLine({
      blocks: [{ type: "thinking", thinking: "brief" }],
      isStreaming: false,
      labels,
    });
    expect(line).toBe("Thought for 0.1s");
    expect(line).not.toMatch(/Thinking/);
  });

  it("does not invent toolCount×0.4 when durations are missing", () => {
    const line = buildActivitySummaryLine({
      blocks: [
        { type: "tool_use", id: "1", name: "read" },
        { type: "tool_use", id: "2", name: "grep" },
      ],
      isStreaming: false,
      labels,
    });
    expect(line).toContain("Worked for —");
    expect(line).toContain("2 tools");
    expect(line).not.toMatch(/0\.8s|0\.5s/);
  });

  it("prefers OpenCode wall span over summed block durations", () => {
    const line = buildActivitySummaryLine({
      blocks: [
        { type: "thinking", thinking: "x", timeStart: 1000, timeEnd: 2000, duration: 1 },
        { type: "tool_use", id: "1", name: "read", timeStart: 3000, timeEnd: 6000, duration: 3 },
      ],
      isStreaming: false,
      labels,
    });
    // span 1000→6000 = 5.0s (not 1+3=4)
    expect(line).toContain("5.0s");
  });
});

describe("formatActivityDuration", () => {
  it("formats sub-minute and minute durations", () => {
    expect(formatActivityDuration(14.1)).toBe("14.1s");
    expect(formatActivityDuration(92)).toBe("1m 32s");
  });
});

describe("countActivityTools", () => {
  it("counts tool_use only", () => {
    expect(
      countActivityTools([
        { type: "thinking", thinking: "a" },
        { type: "tool_use", id: "1", name: "read" },
      ]),
    ).toBe(1);
  });
});

describe("coalesceActivitySegments", () => {
  it("merges two activity segments separated by short text", () => {
    const merged = coalesceActivitySegments([
      { kind: "activity", blockIndices: [0], blocks: [{ type: "tool_use", id: "a", name: "read" }] },
      { kind: "text", blockIndex: 1, block: { type: "text", text: "hi" } },
      { kind: "activity", blockIndices: [2], blocks: [{ type: "tool_use", id: "b", name: "grep" }] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind).toBe("activity");
  });
});
