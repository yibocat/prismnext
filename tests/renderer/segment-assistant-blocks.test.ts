import { describe, it, expect } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  activityFoldPersistKey,
  isActivityBurstStreaming,
  segmentAssistantBlocks,
  buildActivitySummaryLine,
  collectActivityBurstInventory,
  describeLatestActivityBlock,
  countActivityTools,
  formatActivityDuration,
  formatActivityInventoryLine,
  splitProcessAndFinalReply,
  type AssistantSegment,
} from "../../src/renderer/lib/chat/segment-assistant-blocks";
import { toolUseContextTitle } from "../../src/renderer/components/modules/chat/tools/shared";

/** Inner burst keys stay `a|t|x` + first index. Outer `worked` is a chrome remount. */
function foldIdentityKeys(segments: AssistantSegment[]): string[] {
  const keys: string[] = [];
  const walk = (segs: readonly AssistantSegment[]) => {
    for (const seg of segs) {
      if (seg.kind === "worked") {
        keys.push("WORKED-REMOUNT");
        walk(seg.children);
        continue;
      }
      if (seg.kind === "activity") keys.push(`a${seg.blockIndices[0]}`);
      else if (seg.kind === "tool") keys.push(`t${seg.blockIndex}`);
      else if (seg.kind === "text") keys.push(`x${seg.blockIndex}`);
    }
  };
  walk(segments);
  return keys;
}

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
  it("live: splits leading thought from the tool Activity fold", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "read", input: { file_path: "main.tex" } },
      { type: "tool_use", id: "t2", name: "grep", input: { pattern: "cite" } },
      { type: "text", text: "Here is the answer." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    // Live keeps burst folds open (no Worked-for shell mid-stream): the shell
    // toggling on prose↔tool alternation remounted the fold tree and made
    // streaming visibly jump. The wrap happens exactly once, at settle.
    expect(segments.map((s) => s.kind)).toEqual(["activity", "activity", "text"]);
    expect(segments[0]).toMatchObject({ kind: "activity", blockIndices: [0] });
    expect(segments[1]).toMatchObject({ kind: "activity", blockIndices: [1, 2] });
    expect(segments[2]).toMatchObject({ kind: "text", blockIndex: 3 });
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
      "activity",
      "text",
      "activity",
      "activity",
      "text",
    ]);
    expect(segments[5]).toMatchObject({ kind: "text", blockIndex: 5 });
  });

  it("live: does not merge across short prose", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      { type: "text", text: "ok" },
      { type: "tool_use", id: "t2", name: "grep" },
      { type: "text", text: "Final report." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments.map((s) => s.kind)).toEqual(["activity", "text", "activity", "text"]);
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

  it("live: thought then tools stay open as two folds until the final reply", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "bash" },
      { type: "tool_use", id: "t2", name: "glob" },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments.map((s) => s.kind)).toEqual(["activity", "activity"]);
    expect(segments[0]).toMatchObject({ kind: "activity", blockIndices: [0] });
    expect(segments[1]).toMatchObject({ kind: "activity", blockIndices: [1, 2] });
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
      "activity",
      "text",
      "tool",
      "text",
    ]);
    expect(segments[3]).toMatchObject({
      kind: "tool",
      block: { name: "task" },
    });
  });

  it("live: keeps question outside the activity fold (composer chrome owns it)", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "ask" },
      {
        type: "tool_use",
        id: "q1",
        name: "question",
        input: { question: "Pick one?", options: ["A", "B"] },
      },
      { type: "text", text: "Thanks." },
    ];
    const segments = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(segments.map((s) => s.kind)).toEqual(["activity", "tool", "text"]);
    expect(segments[0]).toMatchObject({ kind: "activity", blockIndices: [0] });
    expect(segments[1]).toMatchObject({
      kind: "tool",
      block: { name: "question", id: "q1" },
    });
  });

  it("settled wraps thinking, tools, and interim prose before the last reply", () => {
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
    const live = segmentAssistantBlocks(blocks, { phase: "live" });
    const settled = segmentAssistantBlocks(blocks, { phase: "settled" });
    // Live: burst folds stay open (stable keys, no mid-stream remount).
    expect(foldIdentityKeys(live)).toEqual(["a0", "a1", "x2", "t3", "x4"]);
    // Settled: one Worked-for shell, once — inner keys keep live identities.
    expect(foldIdentityKeys(settled)).toEqual(["WORKED-REMOUNT", "a0", "a1", "x2", "t3", "x4"]);
    expect(settled[0]?.kind).toBe("worked");
    expect(settled[1]).toMatchObject({ kind: "text", blockIndex: 4 });
    const worked = settled[0];
    expect(worked && worked.kind === "worked" ? worked.children.map((c) => c.kind) : []).toEqual([
      "activity",
      "activity",
      "text",
      "tool",
    ]);
  });

  it("live keeps folds open when the final reply starts; settled wraps once", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "ls" },
      { type: "tool_use", id: "t2", name: "read" },
      { type: "text", text: "我读了这份文件——" },
    ];
    const live = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(live.map((s) => s.kind)).toEqual(["activity", "activity", "text"]);
    const settled = segmentAssistantBlocks(blocks, { phase: "settled" });
    expect(settled.map((s) => s.kind)).toEqual(["worked", "text"]);
  });

  it("live keeps the process tree open while tools are still the last segment", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
      { type: "tool_use", id: "t1", name: "ls" },
      { type: "text", text: "Checking layout." },
      { type: "tool_use", id: "t2", name: "read" },
    ];
    const live = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(live.map((s) => s.kind)).toEqual(["activity", "activity", "text", "activity"]);
  });

  it("history default wraps process before the final reply; inner keys stay live identities", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      { type: "text", text: "Mid." },
      { type: "tool_use", id: "t2", name: "grep" },
      { type: "text", text: "Final." },
    ];
    const live = foldIdentityKeys(segmentAssistantBlocks(blocks, { phase: "live" }));
    const history = foldIdentityKeys(segmentAssistantBlocks(blocks));
    expect(live).toEqual(["a0", "x1", "a2", "x3"]);
    expect(history).toEqual(["WORKED-REMOUNT", "a0", "x1", "a2", "x3"]);
  });

  it("prose-only turns never grow a Worked-for shell", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Hello." },
    ];
    const live = segmentAssistantBlocks(blocks, { phase: "live" });
    const settled = segmentAssistantBlocks(blocks, { phase: "settled" });
    expect(live.map((s) => s.kind)).toEqual(["text"]);
    expect(settled.map((s) => s.kind)).toEqual(["text"]);
  });

  it("thinking-only stays a single Thought fold — no Worked-for shell", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan the answer" },
      { type: "text", text: "Here is the answer." },
    ];
    expect(segmentAssistantBlocks(blocks, { phase: "live" }).map((s) => s.kind)).toEqual([
      "activity",
      "text",
    ]);
    expect(segmentAssistantBlocks(blocks, { phase: "settled" }).map((s) => s.kind)).toEqual([
      "activity",
      "text",
    ]);
  });

  it("keeps brief thoughts inside a tool Activity after tools have started", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      { type: "thinking", thinking: "brief" },
      { type: "tool_use", id: "t2", name: "grep" },
      { type: "text", text: "Final." },
    ];
    const settled = segmentAssistantBlocks(blocks, { phase: "settled" });
    expect(settled.map((s) => s.kind)).toEqual(["worked", "text"]);
    const worked = settled[0];
    expect(worked && worked.kind === "worked" ? worked.children : []).toMatchObject([
      { kind: "activity", blockIndices: [0, 1, 2] },
    ]);
  });

  it("live: folds process preamble when the trailing text starts a heading reply", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      {
        type: "text",
        text: "我读了这份文件，先看结构。\n\n## 总结\n这是正式回复。",
      },
    ];
    const live = segmentAssistantBlocks(blocks, { phase: "live" });
    // Strong (heading) split applies live; segments stay unwrapped burst shapes.
    expect(live.map((s) => s.kind)).toEqual(["activity", "text", "text"]);
    expect(live[1]).toMatchObject({
      kind: "text",
      block: { text: "我读了这份文件，先看结构。" },
    });
    expect(live[2]).toMatchObject({
      kind: "text",
      block: { text: "## 总结\n这是正式回复。" },
    });
  });

  it("live: leaves an unsplit preamble+reply glued together until settle or a heading", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      {
        type: "text",
        text: "我先看了一下附件。\n\n这份文档讲的是 RAG 六步流程，下面按步骤拆开。",
      },
    ];
    const live = segmentAssistantBlocks(blocks, { phase: "live" });
    expect(live.map((s) => s.kind)).toEqual(["activity", "text"]);
    expect(live[1]).toMatchObject({
      kind: "text",
      block: {
        text: "我先看了一下附件。\n\n这份文档讲的是 RAG 六步流程，下面按步骤拆开。",
      },
    });
  });

  it("settled: folds a short trailing preamble before the longer reply", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "read" },
      {
        type: "text",
        text: "我先看了一下附件。\n\n这份文档讲的是 RAG 六步流程，下面按步骤拆开。",
      },
    ];
    const settled = segmentAssistantBlocks(blocks, { phase: "settled" });
    expect(settled.map((s) => s.kind)).toEqual(["worked", "text"]);
    const worked = settled[0];
    expect(worked && worked.kind === "worked" ? worked.children : []).toMatchObject([
      { kind: "activity", blockIndices: [0] },
      { kind: "text", block: { text: "我先看了一下附件。" } },
    ]);
    expect(settled[1]).toMatchObject({
      kind: "text",
      block: { text: "这份文档讲的是 RAG 六步流程，下面按步骤拆开。" },
    });
  });
});

describe("splitProcessAndFinalReply", () => {
  it("uses a heading after a blank line as the live/strong split", () => {
    expect(
      splitProcessAndFinalReply("看完了。\n\n## 结论\n可以发布。"),
    ).toEqual({
      process: "看完了。",
      reply: "## 结论\n可以发布。",
    });
  });

  it("does not soft-split while streaming", () => {
    expect(
      splitProcessAndFinalReply("看完了。\n\n下面是完整说明，比前言更长的一段正文。"),
    ).toBeNull();
  });

  it("soft-splits a short preamble once the turn has settled", () => {
    expect(
      splitProcessAndFinalReply(
        "看完了。\n\n下面是完整说明，比前言更长的一段正文。",
        { allowSoft: true },
      ),
    ).toEqual({
      process: "看完了。",
      reply: "下面是完整说明，比前言更长的一段正文。",
    });
  });

  it("does not steal a heading-led answer into process", () => {
    expect(
      splitProcessAndFinalReply("## 总结\n正文", { allowSoft: true }),
    ).toBeNull();
  });

  it("does not split a single paragraph — we cannot tell process from reply", () => {
    expect(
      splitProcessAndFinalReply("我先看了附件，这份文档讲的是 RAG 六步流程。", {
        allowSoft: true,
      }),
    ).toBeNull();
  });
});

describe("activity fold identity", () => {
  it("persist keys only depend on turnId + first block index", () => {
    expect(activityFoldPersistKey("turn-9", 0)).toBe("turn-9:a0");
    expect(activityFoldPersistKey("turn-9", 3)).toBe("turn-9:a3");
  });

  it("a burst stays streaming while a tool is running, even after later prose exists", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan", duration: 1 },
      { type: "tool_use", id: "t1", name: "read", status: "running" },
    ];
    expect(isActivityBurstStreaming(blocks, true)).toBe(true);
    expect(isActivityBurstStreaming(blocks, false)).toBe(false);
  });

  it("a burst stays streaming while the last thinking is unsealed", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "still going" },
    ];
    expect(isActivityBurstStreaming(blocks, true)).toBe(true);
    expect(isActivityBurstStreaming(
      [{ type: "thinking", thinking: "done", duration: 1.2 }],
      true,
    )).toBe(false);
  });

  it("a thinking burst is sealed once a later segment has started", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan" },
    ];
    expect(isActivityBurstStreaming(blocks, true, { hasLaterSegment: true })).toBe(false);
  });

  it("a finished burst is not streaming once tools have completed", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "plan", duration: 0.4 },
      { type: "tool_use", id: "t1", name: "read", status: "completed", duration: 1 },
    ];
    expect(isActivityBurstStreaming(blocks, true)).toBe(false);
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

  it("summarizes Pi find and ls from args, not ACP title", () => {
    expect(
      describeLatestActivityBlock({
        type: "tool_use",
        name: "find",
        input: { pattern: "**/*.tex", path: "manuscript" },
      }),
    ).toBe("**/*.tex");
    expect(
      describeLatestActivityBlock({
        type: "tool_use",
        name: "ls",
        input: { path: "notes/archive" },
      }),
    ).toBe("archive");
    expect(
      describeLatestActivityBlock({
        type: "tool_use",
        name: "ls",
        input: {},
      }),
    ).toBe(".");
  });
});

describe("toolUseContextTitle", () => {
  it("uses args when Pi sends no ACP title, and skips a bare tool name", () => {
    expect(toolUseContextTitle({
      name: "find",
      input: { pattern: "*.md" },
    })).toBe("*.md");
    expect(toolUseContextTitle({
      name: "mystery",
      input: {},
    })).toBe("");
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
