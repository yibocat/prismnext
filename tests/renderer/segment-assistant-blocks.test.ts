import { describe, it, expect } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  segmentAssistantBlocks,
  buildActivitySummaryLine,
  collectActivityBurstInventory,
  describeLatestActivityBlock,
  countActivityTools,
  formatActivityDuration,
  formatActivityInventoryLine,
} from "../../src/renderer/lib/chat/segment-assistant-blocks";

const labels = {
  thinking: "Thinking…",
  thoughtFor: (d: string) => `Thought for ${d}`,
  planning: "Planning…",
  exploring: "Exploring…",
  editing: "Editing…",
  executing: "Executing…",
  plannedFor: (d: string, n: number) =>
    n > 0 ? `Planned for ${d} · ${n} tools` : `Planned for ${d}`,
  exploredFor: (d: string, n: number) =>
    n > 0 ? `Explored for ${d} · ${n} tools` : `Explored for ${d}`,
  editedFor: (d: string, n: number) =>
    n > 0 ? `Edited for ${d} · ${n} tools` : `Edited for ${d}`,
  executedFor: (d: string, n: number) =>
    n > 0 ? `Executed for ${d} · ${n} tools` : `Executed for ${d}`,
  workedFor: (d: string) => `Worked for ${d}`,
};

describe("segmentAssistantBlocks", () => {
  it("live: groups consecutive thinking and tools into one activity fold", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "read", input: { file_path: "main.tex" } },
      { type: "tool_use", id: "t2", name: "grep", input: { pattern: "cite" } },
      { type: "text", text: "Here is the answer." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ kind: "activity", blockIndices: [0, 1, 2] });
    expect(segments[1]).toMatchObject({ kind: "text", blockIndex: 3 });
  });

  it("live: keeps AI prose outside and starts a new fold after prose", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "read", input: { file_path: "main.tex" } },
      { type: "text", text: "Checking the repo layout first." },
      { type: "thinking", thinking: "check" },
      { type: "tool_use", id: "t2", name: "grep", input: { pattern: "cite" } },
      { type: "text", text: "More answer." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments.map((s) => s.kind)).toEqual([
      "activity",
      "text",
      "activity",
      "text",
    ]);
    expect(segments[0]).toMatchObject({ kind: "activity", blockIndices: [0, 1] });
    expect(segments[2]).toMatchObject({ kind: "activity", blockIndices: [3, 4] });
  });

  it("live: does not merge across short prose", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      { type: "text", text: "ok" },
      { type: "tool_use", id: "t2", name: "grep" },
      { type: "text", text: "Final report." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments.map((s) => s.kind)).toEqual([
      "activity",
      "text",
      "activity",
      "text",
    ]);
  });

  it("ignores empty text blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "glob", input: { pattern: "**/*.tex" } },
      { type: "text", text: "   " },
      { type: "text", text: "Done." },
    ];
    expect(segmentAssistantBlocks(blocks, { phase: "live" })).toHaveLength(2);
    expect(segmentAssistantBlocks(blocks, { phase: "settled" })).toHaveLength(2);
  });

  it("live: activity only while tools/thinking stream with no prose yet", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "bash" },
      { type: "tool_use", id: "t2", name: "glob" },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("activity");
  });

  it("live: keeps Task/subagent outside the activity fold as a standalone tool", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "delegate" },
      { type: "tool_use", id: "r1", name: "read", input: { file_path: "a.tex" } },
      { type: "text", text: "Delegating to the auditor." },
      {
        type: "tool_use",
        id: "task1",
        name: "task",
        input: { subagent_type: "methodology-auditor", prompt: "audit" },
      },
      { type: "text", text: "Task finished — here is the synthesis." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments.map((s) => s.kind)).toEqual([
      "activity",
      "text",
      "tool",
      "text",
    ]);
    expect(segments[2]).toMatchObject({
      kind: "tool",
      block: { name: "task", id: "task1" },
    });
  });

  it("settled: Worked-for wraps bursts + interim prose + Task; keeps inner folds", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "delegate" },
      { type: "tool_use", id: "r1", name: "read", input: { file_path: "a.tex" } },
      { type: "text", text: "Delegating to the auditor." },
      {
        type: "tool_use",
        id: "task1",
        name: "task",
        input: { subagent_type: "methodology-auditor", prompt: "audit" },
      },
      { type: "text", text: "Task finished — here is the synthesis." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "settled" });
    expect(segments.map((s) => s.kind)).toEqual(["worked", "text"]);
    if (segments[0]?.kind === "worked") {
      expect(segments[0].children.map((c) => c.kind)).toEqual([
        "activity",
        "text",
        "tool",
      ]);
      expect(segments[0].children[0]).toMatchObject({
        kind: "activity",
        blockIndices: [0, 1],
      });
      expect(segments[0].children[2]).toMatchObject({
        kind: "tool",
        block: { name: "task", id: "task1" },
      });
    }
    expect(segments[1]).toMatchObject({
      kind: "text",
      block: { text: "Task finished — here is the synthesis." },
    });
  });

  it("settled is the default phase (history turns) and preserves burst children", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      { type: "text", text: "Mid." },
      { type: "tool_use", id: "t2", name: "grep" },
      { type: "text", text: "Final." },
    ];
    const segments = segmentAssistantBlocks(blocks);
    expect(segments.map((s) => s.kind)).toEqual(["worked", "text"]);
    if (segments[0]?.kind === "worked") {
      expect(segments[0].children.map((c) => c.kind)).toEqual([
        "activity",
        "text",
        "activity",
      ]);
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
  it("shows streaming exploring hint with last tool", () => {
    const line = buildActivitySummaryLine({
      blocks: [
        { type: "tool_use", id: "1", name: "read", input: { file_path: "a.tex" } },
      ],
      isStreaming: true,
      labels,
    });
    expect(line).toContain("Exploring…");
    expect(line).toContain("a.tex");
  });

  it("shows completed explored-for with tool count for burst folds", () => {
    const line = buildActivitySummaryLine({
      blocks: [
        { type: "thinking", thinking: "x", duration: 2 },
        { type: "tool_use", id: "1", name: "read", duration: 1 },
        { type: "tool_use", id: "2", name: "grep", duration: 1.5 },
      ],
      isStreaming: false,
      labels,
    });
    expect(line).toContain("Explored for");
    expect(line).not.toMatch(/Worked for/);
    expect(line).toContain("2 tools");
    expect(line).toContain("4.5s");
  });

  it("turnSettled uses Worked for instead of burst phase labels", () => {
    const line = buildActivitySummaryLine({
      blocks: [
        { type: "tool_use", id: "1", name: "read", duration: 1 },
        { type: "tool_use", id: "2", name: "grep", duration: 1 },
      ],
      isStreaming: false,
      turnSettled: true,
      labels,
    });
    expect(line).toContain("Worked for");
    expect(line).not.toMatch(/Explored for/);
  });

  it("uses executing labels for bash bursts", () => {
    const live = buildActivitySummaryLine({
      blocks: [{ type: "tool_use", id: "1", name: "bash", input: { command: "pnpm test" } }],
      isStreaming: true,
      labels,
    });
    expect(live).toContain("Executing…");
    const done = buildActivitySummaryLine({
      blocks: [{ type: "tool_use", id: "1", name: "bash", duration: 3 }],
      isStreaming: false,
      labels,
    });
    expect(done).toContain("Executed for");
  });

  it("uses editing labels for write/edit bursts", () => {
    const live = buildActivitySummaryLine({
      blocks: [{ type: "tool_use", id: "1", name: "edit", input: { file_path: "a.tex" } }],
      isStreaming: true,
      labels,
    });
    expect(live).toContain("Editing…");
    const done = buildActivitySummaryLine({
      blocks: [{ type: "tool_use", id: "1", name: "write", duration: 2 }],
      isStreaming: false,
      labels,
    });
    expect(done).toContain("Edited for");
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
    expect(line).toContain("Explored for —");
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
    expect(line).toContain("5.0s");
  });
});

describe("collectActivityBurstInventory", () => {
  it("counts edits/reads/searches/commands and +/- from edit diffs", () => {
    const inv = collectActivityBurstInventory([
      { type: "thinking", thinking: "plan" },
      {
        type: "tool_use",
        id: "e1",
        name: "edit",
        input: {
          file_path: "a.tex",
          old_string: "one\ntwo\n",
          new_string: "one\ntwo\nthree\n",
        },
      },
      {
        type: "tool_use",
        id: "e2",
        name: "edit",
        input: {
          file_path: "b.tex",
          old_string: "x\ny\n",
          new_string: "x\n",
        },
      },
      { type: "tool_use", id: "r1", name: "read", input: { file_path: "a.tex" } },
      { type: "tool_use", id: "r2", name: "read", input: { file_path: "c.tex" } },
      { type: "tool_use", id: "g1", name: "grep", input: { pattern: "foo" } },
      { type: "tool_use", id: "b1", name: "bash", input: { command: "pnpm test" } },
    ]);
    expect(inv.editedFiles).toBe(2);
    expect(inv.exploredFiles).toBe(2);
    expect(inv.searches).toBe(1);
    expect(inv.commands).toBe(1);
    expect(inv.added).toBeGreaterThan(0);
    expect(inv.removed).toBeGreaterThan(0);
  });

  it("formats Cursor-style inventory line", () => {
    const line = formatActivityInventoryLine(
      {
        editedFiles: 6,
        exploredFiles: 7,
        searches: 7,
        commands: 8,
        lints: 1,
        added: 104,
        removed: 299,
      },
      {
        editedFiles: (n) => `Edited ${n} files`,
        exploredFiles: (n) => `explored ${n} files`,
        searches: (n) => `${n} searches`,
        commands: (n) => `ran ${n} commands`,
        lints: "lints",
      },
    );
    expect(line).toBe(
      "Edited 6 files, explored 7 files, 7 searches, lints, ran 8 commands",
    );
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
