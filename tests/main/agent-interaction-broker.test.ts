import { describe, expect, it } from "vitest";
import { InteractionBroker } from "../../src/main/agent/interaction-broker";

describe("InteractionBroker", () => {
  it("hangs a question until the user answers", async () => {
    const seen: string[] = [];
    const broker = new InteractionBroker({
      onQuestion: (input) => seen.push(input.prompt),
    });
    const pending = broker.askQuestion({
      requestId: "q-1",
      runtimeSessionId: "rt-1",
      tabId: "tab-1",
      turnId: "turn-1",
      prompt: "Which corpus?",
      options: ["A", "B"],
    });
    expect(broker.pendingCount()).toBe(1);
    expect(seen).toEqual(["Which corpus?"]);
    expect(broker.resolveQuestion("q-1", { answer: "A" })).toBe(true);
    await expect(pending).resolves.toEqual({
      ok: true,
      answer: "A",
      selected: undefined,
    });
    expect(broker.pendingCount()).toBe(0);
  });

  it("does not fake-accept a plan suggestion", async () => {
    const broker = new InteractionBroker();
    const pending = broker.suggestPlan({
      requestId: "p-1",
      runtimeSessionId: "rt-1",
      tabId: "tab-1",
      turnId: "turn-1",
      reason: "Need a protocol",
    });
    expect(broker.resolvePlanSuggest("p-1", "dismiss")).toBe(true);
    await expect(pending).resolves.toEqual({
      accepted: false,
      reason: "user_dismiss",
    });
  });
});
