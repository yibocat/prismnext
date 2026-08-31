import { describe, it, expect } from "vitest";
import { ORCHESTRATOR_JUDGMENT_PROMPT } from "../../src/main/prompts";

describe("ORCHESTRATOR_JUDGMENT_PROMPT", () => {
  it("covers proactive scheduling and Task delegation for the orchestrator", () => {
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Orchestrator judgment");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Scope boundary");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Direct handling vs Task delegation");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Writing a Task brief");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Synthesizing expert output");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Available subagents (via Task)");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Do not search the project");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("call Task immediately");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toMatch(/Experts only/i);
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toMatch(/Task reports error/i);
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toMatch(/continue with platform tools/i);
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toMatch(/background/i);
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toContain("literature-cite-check");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toContain("literature-stage");
  });
});
