import { describe, expect, it } from "vitest";
import { emptyConversation } from "../../src/shared/agent/conversation";
import {
  formatConversationTranscript,
  transcriptHasBody,
} from "../../src/renderer/lib/chat/session-transcript";

describe("formatConversationTranscript", () => {
  it("emits only the title when the conversation is empty", () => {
    const conv = emptyConversation({ conversationId: "c1", title: "Draft" });
    expect(formatConversationTranscript(conv)).toBe("# Draft\n");
    expect(transcriptHasBody(formatConversationTranscript(conv))).toBe(false);
  });

  it("joins user and assistant text blocks and skips tools / thinking", () => {
    const conv = emptyConversation({ conversationId: "c1", title: "Paper notes" });
    conv.turns.push({
      turnId: "t1",
      turnIndex: 0,
      status: "completed",
      user: {
        blocks: [
          { type: "text", text: "Rewrite the abstract." },
          { type: "tool_use", name: "read", id: "call-1" },
        ],
      },
      assistant: {
        blocks: [
          { type: "thinking", thinking: "plan first" },
          { type: "tool_use", name: "edit", id: "call-2" },
          { type: "tool_result", tool_use_id: "call-2", content: "ok" },
          { type: "text", text: "Here is a shorter abstract." },
          { type: "text", text: "I also tightened the claim." },
        ],
      },
    });

    expect(formatConversationTranscript(conv)).toBe(
      [
        "# Paper notes",
        "",
        "## User",
        "",
        "Rewrite the abstract.",
        "",
        "## Assistant",
        "",
        "Here is a shorter abstract.",
        "",
        "I also tightened the claim.",
        "",
      ].join("\n"),
    );
    expect(transcriptHasBody(formatConversationTranscript(conv))).toBe(true);
  });

  it("includes the live turn after completed turns", () => {
    const conv = emptyConversation({ conversationId: "c1", title: "Live" });
    conv.turns.push({
      turnId: "t1",
      turnIndex: 0,
      status: "completed",
      user: { blocks: [{ type: "text", text: "First" }] },
      assistant: { blocks: [{ type: "text", text: "Reply" }] },
    });
    conv.live = {
      turnId: "t2",
      turnIndex: 1,
      status: "streaming",
      user: { blocks: [{ type: "text", text: "Follow up" }] },
      assistant: { blocks: [{ type: "text", text: "Working…" }] },
    };

    const md = formatConversationTranscript(conv);
    expect(md).toContain("## User\n\nFirst\n");
    expect(md).toContain("## User\n\nFollow up\n");
    expect(md).toContain("## Assistant\n\nWorking…\n");
  });

  it("prefers the explicit title argument", () => {
    const conv = emptyConversation({ conversationId: "c1", title: "Stored" });
    expect(formatConversationTranscript(conv, "Sidebar title")).toBe("# Sidebar title\n");
  });
});
