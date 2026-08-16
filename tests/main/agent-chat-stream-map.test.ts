import { describe, expect, it } from "vitest";
import {
  ChatStreamDeltaTracker,
  broadcastChatStream,
  mapChatStreamToAgentEvent,
} from "../../src/main/agent/events";

const ctx = {
  runtimeSessionId: "ses-1",
  tabId: "tab-1",
  turnId: "turn-1",
};

describe("mapChatStreamToAgentEvent", () => {
  it("turns accumulated OpenCode text parts into true text deltas", () => {
    const tracker = new ChatStreamDeltaTracker();
    const first = mapChatStreamToAgentEvent({
      tabId: "tab-1",
      type: "message.part.updated",
      data: { part: { type: "text", text: "Hello" }, messageId: "m1" },
    }, { ...ctx, tracker });
    const second = mapChatStreamToAgentEvent({
      tabId: "tab-1",
      type: "message.part.updated",
      data: { part: { type: "text", text: "Hello world" }, messageId: "m1" },
    }, { ...ctx, tracker });

    expect(first).toMatchObject({ type: "text_delta", text: "Hello", tabId: "tab-1" });
    expect(second).toMatchObject({ type: "text_delta", text: " world" });
  });

  it("maps prepare and session lifecycle without leaking part shapes", () => {
    expect(mapChatStreamToAgentEvent({
      tabId: "tab-1",
      type: "system.prepare",
      data: { phase: "waiting_model" },
    }, ctx)).toMatchObject({ type: "prepare_phase", phase: "waiting_model" });

    expect(mapChatStreamToAgentEvent({
      tabId: "tab-1",
      type: "session.created",
      data: { sessionId: "ses-1" },
    }, ctx)).toMatchObject({ type: "session_created", sessionId: "ses-1" });

    const tool = mapChatStreamToAgentEvent({
      tabId: "tab-1",
      type: "message.part.updated",
      data: { part: { type: "tool", id: "c1", name: "read" } },
    }, ctx);
    expect(tool).toBeNull();
  });

  it("returns null for the same snapshot twice so multi-window fan-out must map once", () => {
    const tracker = new ChatStreamDeltaTracker();
    const payload = {
      tabId: "tab-1",
      type: "message.part.updated",
      data: { part: { type: "text", text: "Hi" } },
    };
    expect(mapChatStreamToAgentEvent(payload, { ...ctx, tracker })?.text).toBe("Hi");
    expect(mapChatStreamToAgentEvent(payload, { ...ctx, tracker })).toBeNull();
  });

  it("drops unknown OpenCode types instead of leaking part shapes", () => {
    expect(mapChatStreamToAgentEvent({
      tabId: "tab-1",
      type: "turn.awaitingBackground",
      data: { sessionId: "ses-1" },
    }, ctx)).toBeNull();
    expect(mapChatStreamToAgentEvent({
      tabId: "tab-1",
      type: "system.promptEmpty",
      data: {},
    }, ctx)).toBeNull();
  });

  it("dual-emits the old stream and the AgentEvent envelope", () => {
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const event = broadcastChatStream(
      (channel, payload) => sent.push({ channel, payload }),
      {
        tabId: "tab-1",
        type: "message.part.updated",
        data: { part: { type: "text", text: "Hi" } },
      },
      ctx,
    );
    expect(event?.type).toBe("text_delta");
    expect(sent.map((item) => item.channel)).toEqual(["chat:stream", "chat:agent-event"]);
    expect(sent[1]?.payload).toMatchObject({ type: "text_delta", text: "Hi" });
  });
});
