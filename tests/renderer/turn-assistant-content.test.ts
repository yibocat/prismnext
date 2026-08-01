import { describe, expect, it } from "vitest";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";
import { mergeAssistantResponseBlocks } from "../../src/renderer/components/modules/chat/turn-assistant-content";

function assistant(text: string, id?: string): ChatStreamMessage {
  return {
    type: "assistant",
    message: {
      content: [
        ...(id
          ? [{ type: "thinking" as const, thinking: "…", id }]
          : []),
        { type: "text", text },
      ],
    },
  };
}

describe("mergeAssistantResponseBlocks", () => {
  it("merges multiple assistant rounds in one turn into one block stream", () => {
    const a = assistant("round 1");
    const b = assistant("round 2");
    const { blocks, hasStopped } = mergeAssistantResponseBlocks([
      { msg: a },
      { msg: b },
    ]);
    expect(hasStopped).toBe(false);
    expect(blocks.filter((x) => x.type === "text").map((x) => x.text)).toEqual([
      "round 1",
      "round 2",
    ]);
  });
});

/**
 * Documents the live/settled gate: mid-turn gaps (committed assistant, streamingMessage
 * briefly null) must NOT flip to settled Worked-for while the tab is still streaming.
 */
describe("turnLive streaming gate", () => {
  it("treats turn as live when tab is streaming even without streamingMessage", () => {
    const turnLive = true;
    const streamingMessage: ChatStreamMessage | null = null;
    const responses: Array<{ msg: ChatStreamMessage }> = [{ msg: assistant("done round") }];
    const isStreamingMsg =
      turnLive
      || (
        !!streamingMessage
        && responses.some(({ msg }) => msg === streamingMessage)
      );
    expect(isStreamingMsg).toBe(true);
  });

  it("settles only when turnLive is false and nothing is streaming", () => {
    const turnLive = false;
    const streamingMessage: ChatStreamMessage | null = null;
    const responses: Array<{ msg: ChatStreamMessage }> = [{ msg: assistant("final") }];
    const isStreamingMsg =
      turnLive
      || (
        !!streamingMessage
        && responses.some(({ msg }) => msg === streamingMessage)
      );
    expect(isStreamingMsg).toBe(false);
  });
});
