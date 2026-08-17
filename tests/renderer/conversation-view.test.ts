import { describe, expect, it } from "vitest";
import { emptyConversation, type Conversation } from "../../src/shared/agent-conversation";
import {
  collectConversationAssistantBlocks,
  conversationDisplayTurns,
  conversationHasContent,
} from "@/lib/chat/conversation-view";
import { buildToolResultMapFromBlocks } from "@/components/modules/chat/tools/tool-result-map";

function convWithLiveTool(): Conversation {
  const conv = emptyConversation({ conversationId: "conv-1" });
  return {
    ...conv,
    turns: [{
      turnId: "t0",
      turnIndex: 0,
      user: { blocks: [{ type: "text", text: "first" }] },
      assistant: { blocks: [{ type: "text", text: "done" }] },
      status: "completed",
    }],
    live: {
      turnId: "t1",
      turnIndex: 1,
      user: { blocks: [{ type: "text", text: "look at main.tex" }] },
      assistant: {
        blocks: [
          { type: "thinking", thinking: "file already inlined" },
          { type: "tool_use", id: "s1", name: "ls", input: { path: "manuscript" }, status: "running" },
          {
            type: "tool_result",
            tool_use_id: "s1",
            name: "ls",
            content: { content: [{ type: "text", text: "main.tex" }] },
            status: "completed",
          },
        ],
      },
      status: "streaming",
    },
  };
}

describe("conversation-view", () => {
  it("treats empty conversation as no content", () => {
    expect(conversationHasContent(emptyConversation({ conversationId: "c" }))).toBe(false);
    expect(conversationHasContent(null)).toBe(false);
  });

  it("counts committed turns and a live turn as content", () => {
    expect(conversationHasContent(convWithLiveTool())).toBe(true);
    expect(conversationHasContent({
      ...emptyConversation({ conversationId: "c" }),
      live: {
        turnId: "t1",
        turnIndex: 0,
        user: { blocks: [{ type: "text", text: "hi" }] },
        assistant: { blocks: [] },
        status: "streaming",
      },
    })).toBe(true);
  });

  it("appends live after committed turns instead of flattening to ChatStreamMessage", () => {
    const turns = conversationDisplayTurns(convWithLiveTool());
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      turnId: "t0",
      live: false,
      status: "completed",
      userBlocks: [{ type: "text", text: "first" }],
    });
    expect(turns[1]).toMatchObject({
      turnId: "t1",
      live: true,
      status: "streaming",
      userBlocks: [{ type: "text", text: "look at main.tex" }],
    });
    expect(turns[1].assistantBlocks.some((b) => b.type === "tool_use" && b.id === "s1")).toBe(true);
  });

  it("builds a tool result map that includes live tool_result so cards are not empty while streaming", () => {
    const conv = convWithLiveTool();
    const map = buildToolResultMapFromBlocks(
      collectConversationAssistantBlocks(conv),
      { isStreaming: conv.live !== null },
    );
    expect(map.get("s1")?.content).toEqual({
      content: [{ type: "text", text: "main.tex" }],
    });
  });
});
