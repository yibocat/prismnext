import { describe, expect, it } from "vitest";
import { messageIdsAfterTurn } from "../../src/shared/chat-turns";
import { truncateChatMessagesToTurn } from "@/components/modules/chat/chat-turns";
import type { ChatStreamMessage } from "@/stores/chat-store";

describe("messageIdsAfterTurn", () => {
  it("keeps messages through the target turn only", () => {
    const rows = [
      { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "m2", role: "assistant", parts: [{ type: "text", text: "hello" }] },
      { id: "m3", role: "user", parts: [{ type: "text", text: "next" }] },
      { id: "m4", role: "assistant", parts: [{ type: "text", text: "ok" }] },
    ];
    expect(messageIdsAfterTurn(rows, 0)).toEqual(["m3", "m4"]);
    expect(messageIdsAfterTurn(rows, 1)).toEqual([]);
  });
});

describe("truncateChatMessagesToTurn", () => {
  it("matches UI turn boundaries", () => {
    const messages: ChatStreamMessage[] = [
      { type: "user", message: { content: [{ type: "text", text: "a" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "b" }] } },
      { type: "user", message: { content: [{ type: "text", text: "c" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "d" }] } },
    ];
    const kept = truncateChatMessagesToTurn(messages, 0);
    expect(kept).toHaveLength(2);
    expect(kept[1].type).toBe("assistant");
  });
});
