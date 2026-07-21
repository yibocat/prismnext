import { describe, expect, it } from "vitest";
import {
  countOpenCodeMessages,
  mergePlanUiEvents,
  planArtifactCardFromEvents,
  stripPlanControlTurns,
  type PlanUiEvent,
} from "../../src/renderer/lib/chat/plan-ui-events";
import { PLAN_REJECT_ACK_PROMPT } from "../../src/shared/research-plan";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("plan-ui-events", () => {
  it("merges artifact + decision at afterIndex into OpenCode messages", () => {
    const messages: ChatStreamMessage[] = [
      { type: "user", message: { content: [{ type: "text", text: "hi" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "plan" }] } },
    ];
    const events: PlanUiEvent[] = [
      {
        kind: "plan-artifact",
        path: ".prismnext/research/plans/current-draft.md",
        title: "Demo",
        afterIndex: 2,
      },
      {
        kind: "plan-decision",
        decision: "rejected",
        title: "Demo",
        afterIndex: 2,
      },
    ];
    const merged = mergePlanUiEvents(messages, events);
    expect(merged.map((m) => m.type)).toEqual([
      "user",
      "assistant",
      "plan-artifact",
      "plan-decision",
    ]);
    expect(merged[2]?.planTitle).toBe("Demo");
    expect(merged[3]?.planDecision).toBe("rejected");
  });

  it("marks discarded artifact without openable path", () => {
    const merged = mergePlanUiEvents([], [
      {
        kind: "plan-artifact",
        path: "",
        title: "Gone",
        discarded: true,
        afterIndex: 0,
      },
    ]);
    expect(merged[0]?.type).toBe("plan-artifact");
    expect(merged[0]?.planDiscarded).toBe(true);
    expect(merged[0]?.planPath).toBeUndefined();
  });

  it("countOpenCodeMessages counts only user/assistant", () => {
    const messages: ChatStreamMessage[] = [
      { type: "user", message: { content: [{ type: "text", text: "a" }] } },
      { type: "plan-artifact", planPath: "x", planTitle: "t" },
      { type: "result", result: "ok" },
      { type: "assistant", message: { content: [{ type: "text", text: "b" }] } },
    ];
    expect(countOpenCodeMessages(messages)).toBe(2);
  });

  it("stripPlanControlTurns removes deny kick user but keeps later assistants", () => {
    const messages: ChatStreamMessage[] = [
      { type: "user", message: { content: [{ type: "text", text: "plan please" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "here is a plan" }] } },
      { type: "user", message: { content: [{ type: "text", text: PLAN_REJECT_ACK_PROMPT }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "明白，已废弃" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "Build work stays" }] } },
    ];
    const stripped = stripPlanControlTurns(messages);
    expect(stripped.map((m) => m.type)).toEqual(["user", "assistant", "assistant", "assistant"]);
    expect(stripped[3]?.message?.content?.[0]).toMatchObject({ text: "Build work stays" });
  });

  it("planArtifactCardFromEvents reads latest artifact", () => {
    expect(
      planArtifactCardFromEvents([
        {
          kind: "plan-artifact",
          path: ".prismnext/research/plans/current-draft.md",
          title: "T",
          afterIndex: 2,
        },
        {
          kind: "plan-decision",
          decision: "rejected",
          afterIndex: 2,
        },
      ]),
    ).toEqual({
      path: ".prismnext/research/plans/current-draft.md",
      title: "T",
      discarded: false,
    });
    expect(
      planArtifactCardFromEvents([
        {
          kind: "plan-artifact",
          path: "",
          title: "T",
          discarded: true,
          afterIndex: 2,
        },
      ]),
    ).toEqual({ path: "", title: "T", discarded: true });
  });
});
