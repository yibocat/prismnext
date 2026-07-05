import { describe, it, expect } from "vitest";
import { TASK_DELEGATION_PROMPT } from "../../src/main/prompts/modules/task-delegation";

describe("TASK_DELEGATION_PROMPT", () => {
  it("is generic orchestrator delegation — not domain routing", () => {
    expect(TASK_DELEGATION_PROMPT).toContain("Task delegation (orchestrator)");
    expect(TASK_DELEGATION_PROMPT).toContain("Available experts (via Task)");
    expect(TASK_DELEGATION_PROMPT).not.toContain("never");
    expect(TASK_DELEGATION_PROMPT).not.toContain("literature-cite-check");
    expect(TASK_DELEGATION_PROMPT).not.toContain("@library-scout");
    expect(TASK_DELEGATION_PROMPT).not.toContain("literature-stage");
  });
});
