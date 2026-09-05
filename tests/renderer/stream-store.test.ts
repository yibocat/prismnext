import { beforeEach, describe, expect, it } from "vitest";
import { useStreamStore } from "../../src/renderer/stores/stream-store";
import type { AgentEvent } from "../../src/shared/agent/runtime";

function delta(text: string, turnId = "turn-1"): AgentEvent {
  return { type: "text_delta", runtimeSessionId: "rt", tabId: "tab", turnId, text };
}

function thinkingDelta(text: string, turnId = "turn-1"): AgentEvent {
  return { type: "thinking_delta", runtimeSessionId: "rt", tabId: "tab", turnId, text };
}

describe("stream-store", () => {
  beforeEach(() => {
    useStreamStore.getState().endTurn("tab");
  });

  it("accumulates deltas only for the live turn id", () => {
    const s = useStreamStore.getState();
    s.beginTurn("tab", "turn-1");
    expect(s.applyDelta("tab", delta("Hello "))).toBe(true);
    expect(s.applyDelta("tab", delta("world"))).toBe(true);
    // Stale turn id — dropped (mirrors the reducer's LATE guard).
    expect(s.applyDelta("tab", delta("stale", "turn-0"))).toBe(false);
    // Unknown tab — dropped.
    expect(s.applyDelta("other", delta("x"))).toBe(false);

    const blocks = useStreamStore.getState().blocksFor("tab", "turn-1")!;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "text", text: "Hello world" });
  });

  it("applies thinking deltas and text deltas into ordered blocks", () => {
    const s = useStreamStore.getState();
    s.beginTurn("tab", "turn-1");
    s.applyDelta("tab", thinkingDelta("thinking…"));
    s.applyDelta("tab", delta("answer"));
    s.applyDelta("tab", thinkingDelta("more"));

    const blocks = useStreamStore.getState().blocksFor("tab", "turn-1")!;
    expect(blocks.map((b) => b.type)).toEqual(["thinking", "text", "thinking"]);
  });

  it("setBlocks replaces wholesale and blocksFor rejects mismatched turns", () => {
    const s = useStreamStore.getState();
    s.beginTurn("tab", "turn-1");
    s.applyDelta("tab", delta("old"));
    const replacement = [{ type: "text" as const, text: "synced from reducer" }];
    s.setBlocks("tab", "turn-1", replacement);
    expect(useStreamStore.getState().blocksFor("tab", "turn-1")).toBe(replacement);
    expect(useStreamStore.getState().blocksFor("tab", "turn-9")).toBeNull();
  });

  it("beginTurn resets blocks for a new turn and endTurn clears the tab", () => {
    const s = useStreamStore.getState();
    s.beginTurn("tab", "turn-1");
    s.applyDelta("tab", delta("first"));
    s.beginTurn("tab", "turn-2");
    expect(useStreamStore.getState().blocksFor("tab", "turn-2")).toEqual([]);
    expect(useStreamStore.getState().blocksFor("tab", "turn-1")).toBeNull();
    s.applyDelta("tab", delta("second"));
    s.endTurn("tab");
    expect(useStreamStore.getState().blocksFor("tab", "turn-2")).toBeNull();
  });
});
