import { describe, expect, it } from "vitest";
import {
  buildTaskPermissionBlock,
  extractTaskSubagentType,
  isOpencodeBuiltinTaskSubagent,
  shouldDenyOrchestratorBuiltinTask,
} from "../../src/main/services/task-orchestrator-gate";

describe("task-orchestrator-gate", () => {
  it("buildTaskPermissionBlock denies OpenCode built-ins and allows experts", () => {
    const rules = buildTaskPermissionBlock(["citation-auditor", "literature-scout"]);
    expect(rules["*"]).toBe("deny");
    expect(rules.general).toBe("deny");
    expect(rules.command).toBe("deny");
    expect(rules.explore).toBe("deny");
    expect(rules["citation-auditor"]).toBe("allow");
    expect(rules["literature-scout"]).toBe("allow");
  });

  it("extractTaskSubagentType reads subagent_type from tool input", () => {
    expect(
      extractTaskSubagentType({
        toolCall: { input: { subagent_type: "@General" } },
      }),
    ).toBe("general");
  });

  it("shouldDenyOrchestratorBuiltinTask blocks general/command", () => {
    expect(isOpencodeBuiltinTaskSubagent("general")).toBe(true);
    expect(shouldDenyOrchestratorBuiltinTask("general")).toBe(true);
    expect(shouldDenyOrchestratorBuiltinTask("citation-auditor")).toBe(false);
  });

  it("shouldDenyOrchestratorBuiltinTask denies null/empty subagent (the null-hole fix)", () => {
    // OpenCode defaults to `general` when subagent_type is omitted — a missing id
    // MUST be treated as a built-in and denied, or the orchestrator bypasses the
    // gate by calling task({ prompt }) with no subagent_type.
    expect(shouldDenyOrchestratorBuiltinTask(null)).toBe(true);
    expect(shouldDenyOrchestratorBuiltinTask(undefined)).toBe(true);
    expect(shouldDenyOrchestratorBuiltinTask("")).toBe(true);
  });
});
