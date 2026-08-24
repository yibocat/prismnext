import { describe, expect, it } from "vitest";
import {
  buildPlanSuggestAcceptedResult,
  clampPlanSuggestReason,
  PLAN_SUGGEST_TIMEOUT_MS,
  resolvePlanSuggestGate,
} from "../../src/shared/research/plan-suggest";
import { PLAN_DOC_STRUCTURE_HINTS, sessionDraftPlanRel } from "../../src/shared/research/plan";

describe("resolvePlanSuggestGate", () => {
  it("maps session / dismiss / missing tab", () => {
    expect(resolvePlanSuggestGate({ tabId: "t1", sessionAgent: "plan" })).toBe("already_plan");
    expect(resolvePlanSuggestGate({ tabId: "t1", dismissed: true })).toBe("dismissed");
    expect(resolvePlanSuggestGate({ tabId: null })).toBe("ignored");
    expect(resolvePlanSuggestGate({ tabId: "t1", sessionAgent: "build" })).toBe("show");
  });
});

describe("clampPlanSuggestReason / timeout constant", () => {
  it("trims and clamps", () => {
    expect(clampPlanSuggestReason("  hello  ")).toBe("hello");
    expect(clampPlanSuggestReason("x".repeat(200)).length).toBe(160);
  });

  it("uses 15s consent window", () => {
    expect(PLAN_SUGGEST_TIMEOUT_MS).toBe(15_000);
  });
});

describe("buildPlanSuggestAcceptedResult", () => {
  it("embeds canonical draftPath + same-turn write BINDING", () => {
    const result = buildPlanSuggestAcceptedResult("ses_accept");
    expect(result.suggested).toBe(true);
    expect(result.status).toBe("accepted");
    expect(result.planMode).toBe(true);
    expect(result.draftPath).toBe(sessionDraftPlanRel("ses_accept"));
    expect(result.instruction).toContain(result.draftPath);
    expect(result.instruction).toContain("same turn");
    expect(result.instruction).toContain("Chat text is NOT the plan");
    expect(result.instruction).toContain(PLAN_DOC_STRUCTURE_HINTS);
  });
});
