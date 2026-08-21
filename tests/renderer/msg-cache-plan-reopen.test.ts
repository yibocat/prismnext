import { describe, expect, it } from "vitest";
import {
  _msgCacheGetForTests,
  _msgCacheSetForTests,
} from "../../src/renderer/stores/chat-store";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("msg cache plan reopen", () => {
  it("retains plan-decision + Build assistants for session reopen", () => {
    const sessionId = `ses_cache_${Date.now()}`;
    const messages: ChatStreamMessage[] = [
      { type: "user", message: { content: [{ type: "text", text: "plan" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "draft" }] } },
      {
        type: "plan-decision",
        planDecision: "approved",
        planTitle: "Demo",
        planPath: ".workbench/research/plans/2026-07-18-abcd.md",
      },
      { type: "assistant", message: { content: [{ type: "text", text: "Build step 1" }] } },
    ];
    _msgCacheSetForTests(sessionId, messages);
    const hit = _msgCacheGetForTests(sessionId);
    expect(hit?.map((m) => m.type)).toEqual([
      "user",
      "assistant",
      "plan-decision",
      "assistant",
    ]);
    expect(hit?.[2]?.planDecision).toBe("approved");
    expect(hit?.[3]?.message?.content?.[0]).toMatchObject({ text: "Build step 1" });
  });
});
