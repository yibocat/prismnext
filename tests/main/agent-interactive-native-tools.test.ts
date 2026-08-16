import { describe, expect, it } from "vitest";
import { createInteractiveNativeTools } from "../../src/main/agent/interactive-native-tools";
import { createPiLabNativeTools } from "../../src/main/agent/pi-lab-service";
import { createPiNativeTools } from "../../src/main/agent/pi-sdk-runtime";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-lab-1",
  tabId: "pi-lab",
  turnId: "turn-1",
  toolCallId: "call-1",
  projectRoot: "/tmp/lab-project",
  permissionMode: "auto",
};

describe("interactive native tools (question & suggest-plan)", () => {
  it("executes question and suggest-plan without writing to bridge roots", async () => {
    let askedQuestion: any = null;
    let suggestedPlan: any = null;

    const tools = createInteractiveNativeTools({
      askQuestion: async (input) => {
        askedQuestion = input;
        return { answer: "Option B" };
      },
      suggestPlan: async (input) => {
        suggestedPlan = input;
        return { suggested: true, accepted: true, draftPath: ".brief.md" };
      },
    });

    expect(tools.map((t) => t.name)).toEqual(["question", "suggest-plan"]);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    // 1. question
    const qRes = await byName["question"]!.execute({
      question: "Which optimizer?",
      options: ["AdamW", "SGD"],
      multiSelect: false,
    }, ctx) as any;
    expect(qRes).toEqual({ answer: "Option B" });
    expect(askedQuestion).toEqual({
      question: "Which optimizer?",
      options: ["AdamW", "SGD"],
      multiSelect: false,
      ctx,
    });

    // 2. suggest-plan
    const planRes = await byName["suggest-plan"]!.execute({
      reason: "Complex multi-stage experiment",
    }, ctx) as any;
    expect(planRes).toEqual({ suggested: true, accepted: true, draftPath: ".brief.md" });
    expect(suggestedPlan).toEqual({
      reason: "Complex multi-stage experiment",
      ctx,
    });
  });

  it("registers question and suggest-plan in Pi Lab and Pi native catalog", () => {
    const labNames = createPiLabNativeTools().map((t) => t.name);
    expect(labNames).toContain("question");
    expect(labNames).toContain("suggest-plan");
    expect(labNames).toHaveLength(29); // ALL 29 BUILTIN TOOLS REGISTERED!

    const piNames = createPiNativeTools({
      toolHost: { execute: async () => ({ ok: true }) },
      getContext: () => ctx,
    }).map((t) => t.name);
    expect(piNames).toContain("question");
    expect(piNames).toContain("suggest-plan");
    expect(piNames).toHaveLength(29);
  });
});
