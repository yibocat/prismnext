import { describe, expect, it } from "vitest";
import {
  buildTaskPermissionBlock,
  extractTaskSubagentType,
  formatOrchestratorBuiltinTaskDeniedMessage,
  formatPlanModeExpertTaskDeniedMessage,
  isOpaqueTaskCancelledResult,
  isOpencodeBuiltinTaskSubagent,
  resolveOpaqueTaskCancelledDisplay,
  resolveTaskPermissionDenial,
  shouldDenyReservedTaskSubagent,
} from "../../src/main/agent/task-orchestrator-gate";

describe("task-orchestrator-gate", () => {
  it("buildTaskPermissionBlock allows open builtins and experts; denies plan/build", () => {
    const rules = buildTaskPermissionBlock(["citation-auditor"]);
    expect(rules["*"]).toBe("deny");
    expect(rules.general).toBe("allow");
    expect(rules.explore).toBe("allow");
    expect(rules.command).toBe("allow");
    expect(rules.scout).toBe("allow");
    expect(rules.plan).toBe("deny");
    expect(rules.build).toBe("deny");
    expect(rules["citation-auditor"]).toBe("allow");
  });

  it("extractTaskSubagentType reads subagent_type from tool input", () => {
    expect(
      extractTaskSubagentType({
        toolCall: { input: { subagent_type: "@General" } },
      }),
    ).toBe("general");
  });

  it("shouldDenyReservedTaskSubagent only blocks plan/build", () => {
    expect(shouldDenyReservedTaskSubagent("plan")).toBe(true);
    expect(shouldDenyReservedTaskSubagent("build")).toBe(true);
    expect(shouldDenyReservedTaskSubagent("general")).toBe(false);
    expect(shouldDenyReservedTaskSubagent("citation-auditor")).toBe(false);
    expect(shouldDenyReservedTaskSubagent(null)).toBe(false);
  });

  it("shouldDenyReservedTaskSubagent does not false-deny when subagent type is not yet visible", () => {
    expect(shouldDenyReservedTaskSubagent(undefined)).toBe(false);
    expect(shouldDenyReservedTaskSubagent("")).toBe(false);
    expect(shouldDenyReservedTaskSubagent("research-design-coach")).toBe(false);
  });

  describe("resolveTaskPermissionDenial", () => {
    it("follows task-5 brief matrix", () => {
      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: true,
          subagentId: "general",
          sessionAgent: "build",
        }),
      ).toMatchObject({ code: "nested_task_denied" });

      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "plan",
          sessionAgent: "build",
        }),
      ).toMatchObject({ code: "reserved_subagent_denied" });

      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "general",
          sessionAgent: "build",
        }),
      ).toBeNull();

      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "methodology-auditor",
          sessionAgent: "build",
        }),
      ).toBeNull();

      // Plan session mode may Task experts/explore — only @plan/@build stay reserved.
      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "methodology-auditor",
          sessionAgent: "plan",
        }),
      ).toBeNull();

      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "explore",
          sessionAgent: "plan",
        }),
      ).toBeNull();

      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "plan",
          sessionAgent: "plan",
        }),
      ).toMatchObject({ code: "reserved_subagent_denied" });

      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "general",
          sessionAgent: "build",
          taskAllowlist: ["methodology-auditor"],
        }),
      ).toMatchObject({ code: "task_allowlist_denied" });

      expect(
        resolveTaskPermissionDenial({
          isSubAgentSession: false,
          subagentId: "methodology-auditor",
          sessionAgent: "build",
          taskAllowlist: ["methodology-auditor"],
        }),
      ).toBeNull();
    });
  });

  it("isOpencodeBuiltinTaskSubagent recognizes all OpenCode built-ins", () => {
    expect(isOpencodeBuiltinTaskSubagent("general")).toBe(true);
    expect(isOpencodeBuiltinTaskSubagent("plan")).toBe(true);
    expect(isOpencodeBuiltinTaskSubagent("citation-auditor")).toBe(false);
  });

  it("formatOrchestratorBuiltinTaskDeniedMessage delegates reserved plan/build deny copy", () => {
    const msg = formatOrchestratorBuiltinTaskDeniedMessage("plan");
    expect(msg).toContain("@plan");
    expect(msg).toMatch(/not available/i);
    expect(msg).not.toMatch(/Built-in Task @plan is disabled/i);
  });

  it("formatPlanModeExpertTaskDeniedMessage points to Build + brief tools", () => {
    const msg = formatPlanModeExpertTaskDeniedMessage("research-design-coach");
    expect(msg).toContain("@research-design-coach");
    expect(msg).toMatch(/Plan mode/i);
    expect(msg).toMatch(/switch to Build/i);
    expect(msg).not.toMatch(/Built-in Task/i);
  });

  it("resolveOpaqueTaskCancelledDisplay uses opencode_cancelled for all subagent ids", () => {
    const explore = resolveOpaqueTaskCancelledDisplay("explore");
    expect(explore).toContain("@explore");
    expect(explore).not.toMatch(/Built-in Task @explore is disabled on the orchestrator/i);
    expect(explore).toMatch(/cancelled before it finished|not a user cancel/i);

    const general = resolveOpaqueTaskCancelledDisplay(null);
    expect(general).toContain("@general");
    expect(general).not.toMatch(/Built-in Task @general is disabled/i);

    const expert = resolveOpaqueTaskCancelledDisplay("research-design-coach");
    expect(expert).toContain("@research-design-coach");
    expect(expert).not.toMatch(/Built-in Task/i);
    expect(expert).toMatch(/cancelled before it finished|not a user cancel/i);
  });

  it("isOpaqueTaskCancelledResult detects OpenCode cancel JSON", () => {
    expect(isOpaqueTaskCancelledResult('{"error":"Task cancelled"}')).toBe(true);
    expect(isOpaqueTaskCancelledResult("Task cancelled")).toBe(true);
    expect(isOpaqueTaskCancelledResult(formatOrchestratorBuiltinTaskDeniedMessage("explore"))).toBe(false);
  });

  it("isOpaqueTaskCancelledResult does not swallow richer provider errors", () => {
    expect(isOpaqueTaskCancelledResult('{"error":"Task cancelled: insufficient quota"}')).toBe(false);
    expect(isOpaqueTaskCancelledResult("Task cancelled due to rate limit")).toBe(false);
    expect(isOpaqueTaskCancelledResult("Error: credit balance too low")).toBe(false);
  });
});

