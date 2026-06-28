import { describe, it, expect } from "vitest";
import {
  getPermissionRulesForMode,
  getPermissionRuleForTool,
  resolvePermissionMode,
  shouldPromptForPermission,
  extractPermissionToolName,
  resolvePermissionAction,
  resolveEffectiveAgentTerminalMode,
} from "../../src/main/services/permission-modes";

describe("permission modes", () => {
  it("defaults unknown values to ask", () => {
    expect(resolvePermissionMode(undefined)).toBe("ask");
    expect(resolvePermissionMode("bogus")).toBe("ask");
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

  it("maps delete/move as destructive (ask in all non-readonly modes)", () => {
    expect(getPermissionRulesForMode("ask")).toMatchObject({
      delete: "ask",
      move: "ask",
    });
    expect(getPermissionRulesForMode("auto")).toMatchObject({
      delete: "ask",
      move: "ask",
    });
    expect(getPermissionRulesForMode("readonly")).toMatchObject({
      delete: "deny",
      move: "deny",
    });
    expect(resolvePermissionAction("auto", "delete")).toBe("prompt");
    expect(resolvePermissionAction("auto", "move")).toBe("prompt");
    expect(resolvePermissionAction("ask", "delete")).toBe("prompt");
    expect(resolvePermissionAction("readonly", "delete")).toBe("deny");
  });

  it("maps auto mode to allow edits but ask bash", () => {
    expect(getPermissionRulesForMode("auto")).toMatchObject({
      edit: "allow",
      write: "allow",
      apply_patch: "allow",
      bash: "ask",
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

  it("resolves per-tool rules for auto mode", () => {
    expect(getPermissionRuleForTool("auto", "edit")).toBe("allow");
    expect(getPermissionRuleForTool("auto", "bash")).toBe("ask");
    expect(shouldPromptForPermission("auto", "write")).toBe(false);
    expect(shouldPromptForPermission("auto", "bash")).toBe(true);
  });

  it("extracts tool name from permission payload and resolves auto action", () => {
    expect(extractPermissionToolName({ message: "Allow shell command?" })).toBe("bash");
    expect(extractPermissionToolName({ message: "Edit file main.tex" })).toBe("edit");
    expect(extractPermissionToolName({ kind: "execute" })).toBe("bash");
    expect(extractPermissionToolName({ toolName: "task", message: "rm note/foo.md" })).toBe("bash");
    expect(extractPermissionToolName({ toolCall: { title: "delete" } })).toBe("delete");
    expect(extractPermissionToolName({ toolCall: { title: "move" } })).toBe("move");
    expect(extractPermissionToolName({ message: "Delete file note/rl-notes.md" })).toBe("delete");
    expect(extractPermissionToolName({ message: "Move file a.tex -> b.tex" })).toBe("move");
    expect(resolvePermissionAction("auto", "edit")).toBe("allow");
    expect(resolvePermissionAction("auto", "unknown_tool")).toBe("deny");
    expect(resolvePermissionAction("auto", "grep")).toBe("allow");
    expect(resolvePermissionAction("auto", "bash")).toBe("prompt");
    expect(resolvePermissionAction("ask", "edit")).toBe("prompt");
  });

  it("forces PTY bash when permission mode needs shell prompts", () => {
    expect(resolveEffectiveAgentTerminalMode("ask", "mirror")).toBe("pty");
    expect(resolveEffectiveAgentTerminalMode("auto", "mirror")).toBe("pty");
    expect(resolveEffectiveAgentTerminalMode("readonly", "mirror")).toBe("mirror");
  });
});
