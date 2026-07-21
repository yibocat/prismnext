import { describe, expect, it } from "vitest";
import {
  buildTaskPermissionBlock,
  extractTaskSubagentType,
  formatOrchestratorBuiltinTaskDeniedMessage,
  formatPlanModeExpertTaskDeniedMessage,
  isOpaqueTaskCancelledResult,
  isOpencodeBuiltinTaskSubagent,
  resolveOpaqueTaskCancelledDisplay,
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

  it("shouldDenyOrchestratorBuiltinTask does not false-deny when subagent type is not yet visible", () => {
    // Permission payloads often omit subagent_type — denying here killed Expert Tasks.
    // OpenCode permission.task ("*" / general deny) still blocks bare @general.
    expect(shouldDenyOrchestratorBuiltinTask(null)).toBe(false);
    expect(shouldDenyOrchestratorBuiltinTask(undefined)).toBe(false);
    expect(shouldDenyOrchestratorBuiltinTask("")).toBe(false);
    expect(shouldDenyOrchestratorBuiltinTask("research-design-coach")).toBe(false);
  });

  it("formatOrchestratorBuiltinTaskDeniedMessage clarifies not a user cancel", () => {
    const msg = formatOrchestratorBuiltinTaskDeniedMessage("explore");
    expect(msg).toContain("@explore");
    expect(msg).toMatch(/not a user cancel/i);
    expect(msg).toContain("literature-stage");
  });

  it("formatPlanModeExpertTaskDeniedMessage points to Build + brief tools", () => {
    const msg = formatPlanModeExpertTaskDeniedMessage("research-design-coach");
    expect(msg).toContain("@research-design-coach");
    expect(msg).toMatch(/Plan mode/i);
    expect(msg).toMatch(/switch to Build/i);
    expect(msg).not.toMatch(/Built-in Task/i);
  });

  it("resolveOpaqueTaskCancelledDisplay does not mislabel experts as builtin", () => {
    expect(resolveOpaqueTaskCancelledDisplay("explore")).toContain("Built-in Task @explore");
    expect(resolveOpaqueTaskCancelledDisplay(null)).toContain("Built-in Task @general");
    const expert = resolveOpaqueTaskCancelledDisplay("research-design-coach");
    expect(expert).toContain("@research-design-coach");
    expect(expert).not.toMatch(/Built-in Task/i);
    expect(expert).toMatch(/cancelled before the expert finished/i);
  });

  it("isOpaqueTaskCancelledResult detects OpenCode cancel JSON", () => {
    expect(isOpaqueTaskCancelledResult('{"error":"Task cancelled"}')).toBe(true);
    expect(isOpaqueTaskCancelledResult("Task cancelled")).toBe(true);
    expect(isOpaqueTaskCancelledResult(formatOrchestratorBuiltinTaskDeniedMessage("explore"))).toBe(false);
  });
});
