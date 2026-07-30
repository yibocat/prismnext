import { describe, it, expect } from "vitest";
import {
  getPermissionRulesForMode,
  getPermissionRuleForTool,
  resolvePermissionMode,
  shouldPromptForPermission,
  extractPermissionToolName,
  resolvePermissionAction,
  resolveBridgeToolCallSyncAction,
  resolveEffectiveAgentTerminalMode,
  migratePermissionModeSetting,
  isEditAutoApplyMode,
} from "../../src/main/services/permission-modes";

const ROOT = "/Users/me/paper";

describe("permission modes", () => {
  it("defaults unknown values to edit_auto", () => {
    expect(resolvePermissionMode(undefined)).toBe("edit_auto");
    expect(resolvePermissionMode("bogus")).toBe("edit_auto");
  });

  it("migrates legacy auto → edit_auto on schema v1", () => {
    expect(migratePermissionModeSetting("auto", 1)).toEqual({
      mode: "edit_auto",
      schemaVersion: 2,
      changed: true,
    });
    expect(migratePermissionModeSetting("auto", 2)).toEqual({
      mode: "auto",
      schemaVersion: 2,
      changed: false,
    });
  });

  it("uses smart OpenCode rules for non-readonly modes", () => {
    expect(getPermissionRulesForMode("ask")).toMatchObject({
      edit: "ask",
      write: "ask",
      delete: "ask",
      bash: "ask",
      read: "allow",
      grep: "allow",
    });
    expect(getPermissionRulesForMode("edit_auto")).toMatchObject({
      edit: "ask",
      bash: "ask",
      read: "allow",
    });
    expect(getPermissionRulesForMode("auto")).toMatchObject({
      edit: "ask",
      bash: "ask",
    });
  });

  it("readonly keeps legacy deny rules", () => {
    expect(getPermissionRulesForMode("readonly")).toMatchObject({
      edit: "deny",
      write: "deny",
      bash: "deny",
      read: "allow",
    });
  });

  it("smart policy prompts in-project delete and denies outside", () => {
    expect(resolvePermissionAction("edit_auto", "delete", "build", {
      projectRoot: ROOT,
      filePath: "old.tex",
    })).toBe("prompt");
    expect(resolvePermissionAction("edit_auto", "delete", "build", {
      projectRoot: ROOT,
      filePath: "/tmp/x",
    })).toBe("deny");
    expect(resolvePermissionAction("readonly", "delete")).toBe("deny");
  });

  it("smart policy allows in-project edits", () => {
    expect(resolvePermissionAction("edit_auto", "edit", "build", {
      projectRoot: ROOT,
      filePath: "main.tex",
    })).toBe("allow");
    expect(shouldPromptForPermission("edit_auto", "write", {
      projectRoot: ROOT,
      filePath: "main.tex",
    })).toBe(false);
  });

  it("extracts tool name from permission payload", () => {
    expect(extractPermissionToolName({ message: "Allow shell command?" })).toBe("bash");
    expect(extractPermissionToolName({ message: "Edit file main.tex" })).toBe("edit");
    expect(extractPermissionToolName({ kind: "execute" })).toBe("bash");
    expect(extractPermissionToolName({ toolCall: { title: "delete" } })).toBe("delete");
  });

  it("forces PTY bash when permission mode needs shell prompts", () => {
    expect(resolveEffectiveAgentTerminalMode("ask", "mirror")).toBe("pty");
    expect(resolveEffectiveAgentTerminalMode("edit_auto", "mirror")).toBe("pty");
    expect(resolveEffectiveAgentTerminalMode("auto", "mirror")).toBe("mirror");
  });

  it("treats non-readonly modes as edit auto-apply", () => {
    expect(isEditAutoApplyMode("auto")).toBe(true);
    expect(isEditAutoApplyMode("edit_auto")).toBe(true);
    expect(isEditAutoApplyMode("ask")).toBe(true);
    expect(isEditAutoApplyMode("readonly")).toBe(false);
  });

  it("bridge sync auto-allows in-project git bash", () => {
    expect(resolveBridgeToolCallSyncAction("edit_auto", "bash", "build")).toBe("auto_allow");
    expect(resolveBridgeToolCallSyncAction("edit_auto", "bash", "build")).toBe("auto_allow");
    expect(resolveBridgeToolCallSyncAction("readonly", "bash")).toBe("deny");
  });

  it("Plan agent keeps plan overrides", () => {
    expect(resolvePermissionAction("auto", "delete", "plan")).toBe("deny");
    expect(resolvePermissionAction("auto", "literature-search", "plan")).toBe("allow");
    expect(resolveBridgeToolCallSyncAction("auto", "delete", "plan")).toBe("deny");
  });

  it("legacy registry rules still resolve for readonly", () => {
    expect(getPermissionRuleForTool("readonly", "edit")).toBe("deny");
    expect(getPermissionRuleForTool("readonly", "bash")).toBe("deny");
  });
});
