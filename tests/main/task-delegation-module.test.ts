import { describe, it, expect } from "vitest";
import { TASK_DELEGATION_PROMPT } from "../../src/main/prompts/modules/task-delegation";

describe("TASK_DELEGATION_PROMPT", () => {
  it("is generic orchestrator delegation — not literature routing or cite format", () => {
    expect(TASK_DELEGATION_PROMPT).toContain("Task delegation (orchestrator)");
    expect(TASK_DELEGATION_PROMPT).toContain("Available experts (via Task)");
    expect(TASK_DELEGATION_PROMPT).toContain("When to delegate");
    expect(TASK_DELEGATION_PROMPT).toContain("system modules");

    expect(TASK_DELEGATION_PROMPT).not.toContain("@library-scout");
    expect(TASK_DELEGATION_PROMPT).not.toContain("@literature-scout");
    expect(TASK_DELEGATION_PROMPT).not.toContain("Session citations");
    expect(TASK_DELEGATION_PROMPT).not.toContain("[@bibkey]");
    expect(TASK_DELEGATION_PROMPT).not.toContain("[n]");
    expect(TASK_DELEGATION_PROMPT).not.toContain("| Expert | Scope |");
    expect(TASK_DELEGATION_PROMPT).not.toContain("literature-stage");
  });
});
