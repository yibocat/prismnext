import { describe, it, expect } from "vitest";
import {
  getPermissionRulesForMode,
  getPermissionRuleForTool,
  resolvePermissionMode,
  shouldPromptForPermission,
  extractPermissionToolName,
  resolvePermissionAction,
} from "../../src/main/services/permission-modes";

describe("permission modes", () => {
  it("defaults unknown values to ask", () => {
    expect(resolvePermissionMode(undefined)).toBe("ask");
    expect(resolvePermissionMode("bogus")).toBe("ask");
  });

  it("maps ask mode to interactive edit/bash rules", () => {
    expect(getPermissionRulesForMode("ask")).toMatchObject({
      edit: "ask",
      bash: "ask",
      read: "allow",
      grep: "allow",
      websearch: "allow",
    });
  });

  it("maps auto mode to allow edits but ask bash", () => {
    expect(getPermissionRulesForMode("auto")).toMatchObject({
      edit: "allow",
      write: "allow",
      bash: "ask",
    });
  });

  it("maps readonly mode to deny destructive tools", () => {
    expect(getPermissionRulesForMode("readonly")).toMatchObject({
      edit: "deny",
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
    expect(resolvePermissionAction("auto", "edit")).toBe("allow");
    expect(resolvePermissionAction("auto", "")).toBe("allow");
    expect(resolvePermissionAction("auto", "bash")).toBe("prompt");
    expect(resolvePermissionAction("ask", "edit")).toBe("prompt");
  });
});
