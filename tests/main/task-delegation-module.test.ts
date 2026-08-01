import { describe, it, expect } from "vitest";
import { TASK_DELEGATION_PROMPT } from "../../src/main/prompts/modules/task-delegation";

describe("TASK_DELEGATION_PROMPT", () => {
  it("is generic orchestrator delegation — not domain routing", () => {
    expect(TASK_DELEGATION_PROMPT).toContain("Task delegation (orchestrator)");
    expect(TASK_DELEGATION_PROMPT).toContain("Available subagents (via Task)");
    expect(TASK_DELEGATION_PROMPT).not.toMatch(/Experts only/i);
    expect(TASK_DELEGATION_PROMPT).not.toMatch(/do not use Task.*@General/i);
    expect(TASK_DELEGATION_PROMPT).toMatch(/Task tool_result reports an error/i);
    expect(TASK_DELEGATION_PROMPT).toMatch(/continue yourself/i);
    expect(TASK_DELEGATION_PROMPT).toMatch(/background/i);
    expect(TASK_DELEGATION_PROMPT).toMatch(/Do not poll or sleep/i);
    expect(TASK_DELEGATION_PROMPT).not.toContain("literature-cite-check");
    expect(TASK_DELEGATION_PROMPT).not.toContain("@library-scout");
    expect(TASK_DELEGATION_PROMPT).not.toContain("literature-stage");
  });
});
