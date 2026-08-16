import { describe, expect, it } from "vitest";
import {
  applyAgentEvent,
  contentBlocksFromAgentSink,
  emptyAgentEventPaintSink,
  isLegacyTextOrThinkingPart,
  shouldDropAssistantText,
} from "@/lib/chat/apply-agent-event";
import type { AgentEvent } from "../../src/shared/agent-runtime";

const base = {
  runtimeSessionId: "ses-1",
  tabId: "tab-1",
  turnId: "m1",
};

function textDelta(text: string): AgentEvent {
  return { ...base, type: "text_delta", text };
}

function thinkingDelta(text: string): AgentEvent {
  return { ...base, type: "thinking_delta", text };
}

describe("applyAgentEvent", () => {
  it("accumulates text and thinking deltas into a snapshot the chat store can upsert", () => {
    let sink = emptyAgentEventPaintSink();
    sink = applyAgentEvent(sink, textDelta("Hello"));
    sink = applyAgentEvent(sink, textDelta(" world"));
    sink = applyAgentEvent(sink, thinkingDelta("hmm"));
    sink = applyAgentEvent(sink, thinkingDelta("..."));

    expect(sink).toEqual({ text: "Hello world", thinking: "hmm..." });
    expect(contentBlocksFromAgentSink(sink)).toEqual([
      { type: "thinking", thinking: "hmm..." },
      { type: "text", text: "Hello world" },
    ]);
  });

  it("resets the paint sink when the turn ends so the next turn starts empty", () => {
    let sink = applyAgentEvent(emptyAgentEventPaintSink(), textDelta("old"));
    sink = applyAgentEvent(sink, { ...base, type: "turn_finished" });
    expect(sink).toEqual({ text: "", thinking: "" });
  });

  it("ignores tool / permission events — those still come from the old stream", () => {
    const start = emptyAgentEventPaintSink();
    const next = applyAgentEvent(start, {
      ...base,
      type: "tool_started",
      toolCallId: "c1",
      toolName: "read",
      args: {},
    });
    expect(next).toBe(start);
  });
});

describe("shouldDropAssistantText", () => {
  it("drops empty text, PrismNext system-prompt echoes, and first-token user echoes", () => {
    expect(shouldDropAssistantText("", { lastUserText: "hi", hasRealContent: false })).toBe(true);
    expect(shouldDropAssistantText("hi", { lastUserText: "hi", hasRealContent: false })).toBe(true);
    expect(shouldDropAssistantText("hi", { lastUserText: "hi", hasRealContent: true })).toBe(false);
    expect(shouldDropAssistantText(
      "## Role\nintegrated into prismnext",
      { lastUserText: "", hasRealContent: false },
    )).toBe(true);
  });
});

describe("isLegacyTextOrThinkingPart", () => {
  it("marks OpenCode text/thinking/reasoning parts so the old handler can skip them", () => {
    expect(isLegacyTextOrThinkingPart("text")).toBe(true);
    expect(isLegacyTextOrThinkingPart("thinking")).toBe(true);
    expect(isLegacyTextOrThinkingPart("reasoning")).toBe(true);
    expect(isLegacyTextOrThinkingPart("tool")).toBe(false);
  });
});
