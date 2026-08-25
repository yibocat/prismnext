import { describe, expect, it } from "vitest";
import { emptyConversation, type Conversation } from "../../src/shared/agent/conversation";
import {
  collectConversationAssistantBlocks,
  conversationCompactedCount,
  conversationDisplayTurns,
  conversationHasCommittedTurn,
  conversationHasContent,
  conversationVisibleTurns,
  countConversationTurns,
  findConversationToolUse,
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

  it("hides Approve / Deny control prompts as user bubbles", () => {
    const conv = emptyConversation({ conversationId: "conv-plan" });
    const hidden = conversationDisplayTurns({
      ...conv,
      live: {
        turnId: "t-approve",
        turnIndex: 0,
        user: {
          blocks: [{
            type: "text",
            text: "The user approved the research plan. Continue execution in Build mode.",
          }],
        },
        assistant: { blocks: [{ type: "thinking", thinking: "ok" }] },
        status: "streaming",
      },
    });
    expect(hidden[0]?.userBlocks).toEqual([]);
    expect(hidden[0]?.assistantBlocks).toHaveLength(1);
  });

  it("counts committed turns and ignores the live turn", () => {
    expect(countConversationTurns(null)).toBe(0);
    expect(countConversationTurns(emptyConversation({ conversationId: "c" }))).toBe(0);
    const conv = convWithLiveTool();
    expect(countConversationTurns(conv)).toBe(1);
    expect(conversationHasCommittedTurn(conv, 0)).toBe(true);
    expect(conversationHasCommittedTurn(conv, 1)).toBe(false);
  });

  it("finds a live bash tool_use that the old message list no longer carries", () => {
    const conv = convWithLiveTool();
    expect(findConversationToolUse(conv, "s1")).toMatchObject({
      type: "tool_use",
      id: "s1",
      name: "ls",
      input: { path: "manuscript" },
    });
    expect(findConversationToolUse(conv, "missing")).toBeUndefined();
    expect(findConversationToolUse(null, "s1")).toBeUndefined();
  });

  it("finds a committed tool_use after the live turn is gone", () => {
    const conv: Conversation = {
      ...emptyConversation({ conversationId: "conv-1" }),
      turns: [{
        turnId: "t0",
        turnIndex: 0,
        user: { blocks: [{ type: "text", text: "make notes" }] },
        assistant: {
          blocks: [
            {
              type: "tool_use",
              id: "bash-1",
              name: "bash",
              input: { command: "mkdir -p notes" },
              status: "running",
            },
          ],
        },
        status: "streaming",
      }],
      live: null,
    };
    expect(findConversationToolUse(conv, "bash-1")?.input).toEqual({
      command: "mkdir -p notes",
    });
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

  it("keeps compacted turns in the document view but hides them from the chat transcript", () => {
    const conv: Conversation = {
      ...emptyConversation({ conversationId: "c" }),
      compacted: { throughTurnIndex: 2 },
      turns: [0, 1, 2].map((i) => ({
        turnId: `t${i}`,
        turnIndex: i,
        user: { blocks: [{ type: "text", text: `u${i}` }] },
        assistant: { blocks: [{ type: "text", text: `a${i}` }] },
        status: "completed" as const,
      })),
    };
    expect(conversationDisplayTurns(conv).map((turn) => turn.turnId)).toEqual(["t0", "t1", "t2"]);
    expect(conversationCompactedCount(conv)).toBe(2);
    expect(conversationVisibleTurns(conv).map((turn) => turn.turnId)).toEqual(["t2"]);
    expect(conversationVisibleTurns(conv, { expandCompacted: true }).map((turn) => turn.turnId))
      .toEqual(["t0", "t1", "t2"]);
  });

  it("hides the compiled Referenced files dump from the user bubble", () => {
    const conv: Conversation = {
      ...emptyConversation({ conversationId: "c" }),
      turns: [{
        turnId: "t0",
        turnIndex: 0,
        user: {
          blocks: [{
            type: "text",
            text: [
              "## Referenced files",
              "",
              "[file unavailable: figures/lstm-cell.tex]",
              "Absolute path: `figures/lstm-cell.tex`",
              "Could not read text content. Use file tools if the path is accessible.",
              "",
              "我们专门为 LSTM 画了一个图 @figures/lstm-cell.tex ，你来给我展示一下",
            ].join("\n"),
          }],
        },
        assistant: { blocks: [] },
        status: "completed",
      }],
    };
    expect(conversationDisplayTurns(conv)[0]?.userBlocks).toEqual([{
      type: "text",
      text: "我们专门为 LSTM 画了一个图 @figures/lstm-cell.tex ，你来给我展示一下",
    }]);
  });
});
