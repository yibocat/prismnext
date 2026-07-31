import { describe, expect, it, beforeEach } from "vitest";
import {
  _resetChatSessionRegistryForTests,
  setSessionTaskAllowlist,
  getSessionTaskAllowlist,
  clearSessionTaskAllowlist,
  markSessionTaskAllowlistSatisfied,
  getSessionMissingTaskAllowlist,
  claimTaskAllowlistFollowUp,
  deferTaskAllowlistFollowUp,
  takeDeferredTaskAllowlistFollowUp,
} from "../../src/main/services/chat-session-registry";
import {
  shouldDenyOutsideTaskAllowlist,
  resolveTaskPermissionDenial,
} from "../../src/main/services/task-orchestrator-gate";
import { formatTaskError } from "../../src/shared/task-error-codes";

describe("this-turn Task allowlist + must-invoke (@ experts)", () => {
  beforeEach(() => {
    _resetChatSessionRegistryForTests();
  });

  it("stores normalized allowlist ids", () => {
    setSessionTaskAllowlist("ses-1", ["Methodology-Auditor", "@citation-auditor"]);
    expect(getSessionTaskAllowlist("ses-1")).toEqual([
      "methodology-auditor",
      "citation-auditor",
    ]);
    clearSessionTaskAllowlist("ses-1");
    expect(getSessionTaskAllowlist("ses-1")).toEqual([]);
  });

  it("denies Task outside allowlist when type is visible", () => {
    expect(shouldDenyOutsideTaskAllowlist(["methodology-auditor"], "general")).toBe(true);
    expect(shouldDenyOutsideTaskAllowlist(["methodology-auditor"], "methodology-auditor")).toBe(
      false,
    );
    expect(shouldDenyOutsideTaskAllowlist(["methodology-auditor"], null)).toBe(false);
    expect(shouldDenyOutsideTaskAllowlist(["methodology-auditor"], "expert")).toBe(false);
  });

  it("tracks missing / satisfied Task invocations", () => {
    setSessionTaskAllowlist("ses-1", ["methodology-auditor", "citation-auditor"]);
    expect(getSessionMissingTaskAllowlist("ses-1")).toEqual([
      "methodology-auditor",
      "citation-auditor",
    ]);
    markSessionTaskAllowlistSatisfied("ses-1", "methodology-auditor");
    expect(getSessionMissingTaskAllowlist("ses-1")).toEqual(["citation-auditor"]);
  });

  it("claims follow-up at most once", () => {
    setSessionTaskAllowlist("ses-1", ["methodology-auditor"]);
    expect(claimTaskAllowlistFollowUp("ses-1")).toEqual(["methodology-auditor"]);
    expect(claimTaskAllowlistFollowUp("ses-1")).toEqual([]);
  });

  it("defers follow-up until taken (open-Task race)", () => {
    setSessionTaskAllowlist("ses-1", ["methodology-auditor", "citation-auditor"]);
    deferTaskAllowlistFollowUp("ses-1", { tabId: "tab-1", cwd: "/tmp/p" });
    expect(takeDeferredTaskAllowlistFollowUp("ses-1")).toEqual({
      tabId: "tab-1",
      cwd: "/tmp/p",
    });
    expect(takeDeferredTaskAllowlistFollowUp("ses-1")).toBeNull();
    // New allowlist clears deferred state.
    deferTaskAllowlistFollowUp("ses-1", { tabId: "tab-1" });
    setSessionTaskAllowlist("ses-1", ["methodology-auditor"]);
    expect(takeDeferredTaskAllowlistFollowUp("ses-1")).toBeNull();
  });

  it("resolveTaskPermissionDenial applies allowlist", () => {
    const deny = resolveTaskPermissionDenial({
      isSubAgentSession: false,
      subagentId: "general",
      sessionAgent: "build",
      taskAllowlist: ["methodology-auditor"],
    });
    expect(deny).toMatchObject({ code: "task_allowlist_denied" });
  });

  it("formats not-invoked copy against role-play", () => {
    const msg = formatTaskError("task_allowlist_not_invoked", {
      allowlist: ["methodology-auditor"],
    });
    expect(msg).toContain("@methodology-auditor");
    expect(msg).toMatch(/orchestrator/i);
    expect(msg).toMatch(/role-play|Task tool/i);
  });
});
