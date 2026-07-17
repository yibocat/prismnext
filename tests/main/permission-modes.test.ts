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

describe("permission modes", () => {
  it("defaults unknown values to ask", () => {
    expect(resolvePermissionMode(undefined)).toBe("ask");
    expect(resolvePermissionMode("bogus")).toBe("ask");
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

  it("maps ask mode to interactive edit/bash rules", () => {
    expect(getPermissionRulesForMode("ask")).toMatchObject({
      edit: "ask",
      write: "ask",
      apply_patch: "ask",
      bash: "ask",
      read: "allow",
      grep: "allow",
      glob: "allow",
      todowrite: "allow",
      websearch: "allow",
    });
  });

  it("does not emit ghost tool rules (multiedit/patch/list/plan)", () => {
    const rules = getPermissionRulesForMode("ask");
    expect(rules).not.toHaveProperty("multiedit");
    expect(rules).not.toHaveProperty("patch");
    expect(rules).not.toHaveProperty("list");
    expect(rules).not.toHaveProperty("plan");
  });

  it("maps delete/move: ask in ask/edit_auto, allow in auto, deny in readonly", () => {
    expect(getPermissionRulesForMode("ask")).toMatchObject({
      delete: "ask",
      move: "ask",
    });
    expect(getPermissionRulesForMode("edit_auto")).toMatchObject({
      delete: "ask",
      move: "ask",
    });
    expect(getPermissionRulesForMode("auto")).toMatchObject({
      delete: "allow",
      move: "allow",
    });
    expect(getPermissionRulesForMode("readonly")).toMatchObject({
      delete: "deny",
      move: "deny",
    });
    expect(resolvePermissionAction("edit_auto", "delete")).toBe("prompt");
    expect(resolvePermissionAction("auto", "delete")).toBe("allow");
    expect(resolvePermissionAction("ask", "delete")).toBe("prompt");
    expect(resolvePermissionAction("readonly", "delete")).toBe("deny");
  });

  it("maps edit_auto to allow edits but ask bash", () => {
    expect(getPermissionRulesForMode("edit_auto")).toMatchObject({
      edit: "allow",
      write: "allow",
      apply_patch: "allow",
      bash: "ask",
    });
  });

  it("maps auto (full) to allow edits and bash", () => {
    expect(getPermissionRulesForMode("auto")).toMatchObject({
      edit: "allow",
      write: "allow",
      bash: "allow",
      "experiment-run": "allow",
    });
  });

  it("maps readonly mode to deny destructive tools", () => {
    expect(getPermissionRulesForMode("readonly")).toMatchObject({
      edit: "deny",
      write: "deny",
      apply_patch: "deny",
      bash: "deny",
      read: "allow",
      websearch: "allow",
    });
  });

  it("resolves per-tool rules for edit_auto and auto", () => {
    expect(getPermissionRuleForTool("edit_auto", "edit")).toBe("allow");
    expect(getPermissionRuleForTool("edit_auto", "bash")).toBe("ask");
    expect(shouldPromptForPermission("edit_auto", "write")).toBe(false);
    expect(shouldPromptForPermission("edit_auto", "bash")).toBe(true);
    expect(getPermissionRuleForTool("auto", "bash")).toBe("allow");
    expect(shouldPromptForPermission("auto", "bash")).toBe(false);
  });

  it("extracts tool name from permission payload and resolves actions", () => {
    expect(extractPermissionToolName({ message: "Allow shell command?" })).toBe("bash");
    expect(extractPermissionToolName({ message: "Edit file main.tex" })).toBe("edit");
    expect(extractPermissionToolName({ kind: "execute" })).toBe("bash");
    expect(extractPermissionToolName({ toolName: "task", message: "rm note/foo.md" })).toBe("bash");
    expect(extractPermissionToolName({ toolCall: { title: "delete" } })).toBe("delete");
    expect(extractPermissionToolName({ toolCall: { title: "move" } })).toBe("move");
    expect(extractPermissionToolName({ message: "Delete file note/rl-notes.md" })).toBe("delete");
    expect(extractPermissionToolName({ message: "Move file a.tex -> b.tex" })).toBe("move");
    expect(resolvePermissionAction("edit_auto", "edit")).toBe("allow");
    expect(resolvePermissionAction("edit_auto", "unknown_tool")).toBe("deny");
    expect(resolvePermissionAction("edit_auto", "grep")).toBe("allow");
    expect(resolvePermissionAction("edit_auto", "bash")).toBe("prompt");
    expect(resolvePermissionAction("auto", "bash")).toBe("allow");
    expect(resolvePermissionAction("auto", "unknown_tool")).toBe("allow");
    expect(resolvePermissionAction("ask", "edit")).toBe("prompt");
  });

  it("forces PTY bash when permission mode needs shell prompts", () => {
    expect(resolveEffectiveAgentTerminalMode("ask", "mirror")).toBe("pty");
    expect(resolveEffectiveAgentTerminalMode("edit_auto", "mirror")).toBe("pty");
    expect(resolveEffectiveAgentTerminalMode("auto", "mirror")).toBe("mirror");
    expect(resolveEffectiveAgentTerminalMode("readonly", "mirror")).toBe("mirror");
  });

  it("treats auto and edit_auto as edit auto-apply modes", () => {
    expect(isEditAutoApplyMode("auto")).toBe(true);
    expect(isEditAutoApplyMode("edit_auto")).toBe(true);
    expect(isEditAutoApplyMode("ask")).toBe(false);
  });

  // Regression: Auto + PTY custom bash used to hit syncBashPermissionFromToolCall,
  // see action!=="prompt", and return without writing permission.json — tool hung
  // waiting for an approval UI that never appears.
  it("bridge tool_call sync: auto allows bash/delete; edit_auto still prompts shell", () => {
    expect(resolveBridgeToolCallSyncAction("auto", "bash")).toBe("auto_allow");
    expect(resolveBridgeToolCallSyncAction("auto", "delete")).toBe("auto_allow");
    expect(resolveBridgeToolCallSyncAction("edit_auto", "bash")).toBe("prompt");
    expect(resolveBridgeToolCallSyncAction("edit_auto", "edit")).toBe("auto_allow");
    expect(resolveBridgeToolCallSyncAction("ask", "bash")).toBe("prompt");
    expect(resolveBridgeToolCallSyncAction("readonly", "bash")).toBe("deny");
  });
});
