import { describe, expect, it } from "vitest";
import { reconcileBackgroundSubAgentRunsFromMessages } from "../../src/renderer/lib/chat/reconcile-background-tasks";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

const started = (ses: string) =>
  `<task id="${ses}" status="running">
<summary>Background task started</summary>
<task_result>The task is working in the background.</task_result>
</task>`;

const join = (ses: string) =>
  `<task id="${ses}" status="completed">
<summary>Background task completed: x</summary>
<task_result>Done.</task_result>
</task>`;

function msg(
  type: ChatStreamMessage["type"],
  content: unknown[],
): ChatStreamMessage {
  return {
    type,
    message: { role: type === "assistant" ? "assistant" : "user", content },
  } as ChatStreamMessage;
}

describe("reconcileBackgroundSubAgentRunsFromMessages", () => {
  it("marks only the Task whose child id appears in a join inject", () => {
    const toolA = "call-bg-a";
    const toolB = "call-bg-b";
    const messages = [
      msg("assistant", [
        {
          type: "tool_use",
          id: toolA,
          name: "Task",
          input: { prompt: "a", background: true },
        },
        {
          type: "tool_use",
          id: toolB,
          name: "Task",
          input: { prompt: "b", background: true },
        },
      ]),
      msg("user", [
        { type: "tool_result", tool_use_id: toolA, content: started("ses_a") },
      ]),
      msg("user", [
        { type: "tool_result", tool_use_id: toolB, content: started("ses_b") },
      ]),
      // Only A finished in history — B must stay running (not global sessionHasJoin).
      msg("user", [{ type: "text", text: join("ses_a") }]),
    ];

    const runs = reconcileBackgroundSubAgentRunsFromMessages(messages, {});
    expect(runs[toolA]?.status).toBe("done");
    expect(runs[toolB]?.status).toBe("running");
  });

  it("marks both Tasks done when both join injects are present", () => {
    const toolA = "call-bg-a2";
    const toolB = "call-bg-b2";
    const messages = [
      msg("assistant", [
        {
          type: "tool_use",
          id: toolA,
          name: "Task",
          input: { prompt: "a", background: true },
        },
        {
          type: "tool_use",
          id: toolB,
          name: "Task",
          input: { prompt: "b", background: true },
        },
      ]),
      msg("user", [
        { type: "tool_result", tool_use_id: toolA, content: started("ses_a2") },
      ]),
      msg("user", [
        { type: "tool_result", tool_use_id: toolB, content: started("ses_b2") },
      ]),
      msg("user", [{ type: "text", text: join("ses_a2") }]),
      msg("user", [{ type: "text", text: join("ses_b2") }]),
    ];

    const runs = reconcileBackgroundSubAgentRunsFromMessages(messages, {});
    expect(runs[toolA]?.status).toBe("done");
    expect(runs[toolB]?.status).toBe("done");
  });

  it("keeps running when only Timeline-A started exists (no join)", () => {
    const toolId = "call-bg-solo";
    const messages = [
      msg("assistant", [
        {
          type: "tool_use",
          id: toolId,
          name: "Task",
          input: { prompt: "x", background: true },
        },
      ]),
      msg("user", [
        { type: "tool_result", tool_use_id: toolId, content: started("ses_solo") },
      ]),
    ];

    const runs = reconcileBackgroundSubAgentRunsFromMessages(messages, {
      [toolId]: {
        expertId: "general",
        prompt: "x",
        mode: "background",
        status: "running",
        blocks: [],
      },
    });
    expect(runs[toolId]?.status).toBe("running");
  });
});
