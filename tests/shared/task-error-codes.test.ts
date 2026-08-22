import { describe, expect, it } from "vitest";
import { formatTaskError } from "../../src/shared/agent/task-error-codes";

describe("formatTaskError", () => {
  it("formats reserved deny for plan", () => {
    const msg = formatTaskError("reserved_subagent_denied", { subagentId: "plan" });
    expect(msg).toContain("@plan");
    expect(msg).toMatch(/not available/i);
    expect(msg).not.toMatch(/Built-in Task @general is disabled/i);
  });

  it("formats nested deny as subagent nesting ban", () => {
    const msg = formatTaskError("nested_task_denied");
    expect(msg).toMatch(/nested task is not allowed/i);
    expect(msg).toMatch(/subagents cannot call the Task tool/i);
    expect(msg).not.toMatch(/while one is already running in this conversation/i);
  });

  it("formats await_timeout without blaming unrelated modes", () => {
    const msg = formatTaskError("await_timeout", { subagentId: "methodology-auditor" });
    expect(msg).toContain("methodology-auditor");
    expect(msg).toMatch(/did not finish|timed out/i);
  });

  it("formats task_allowlist_denied against allowlist", () => {
    const msg = formatTaskError("task_allowlist_denied", {
      subagentId: "general",
      allowlist: ["methodology-auditor"],
    });
    expect(msg).toContain("@general");
    expect(msg).toContain("@methodology-auditor");
    expect(msg).toMatch(/allowlist/i);
  });

  it("formats user_cancel so the main agent continues", () => {
    const msg = formatTaskError("user_cancel", { subagentId: "explore" });
    expect(msg).toContain("@explore");
    expect(msg).toMatch(/user stopped/i);
    expect(msg).toMatch(/continue/i);
    expect(msg).not.toMatch(/not a user cancel/i);
  });

  it("formats abort_failed without claiming Stopped", () => {
    const msg = formatTaskError("abort_failed", {
      subagentId: "explore",
      detail: "unreachable",
    });
    expect(msg).toContain("@explore");
    expect(msg).toMatch(/could not stop/i);
    expect(msg).toMatch(/unreachable/);
    expect(msg).not.toMatch(/user stopped/i);
  });
});
