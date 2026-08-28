import { describe, it, expect } from "vitest";
import {
  TOOL_PERMISSION_REGISTRY,
  getToolPermissionEntry,
  buildPermissionRulesForMode,
} from "../../src/shared/permissions/tool-registry";
import {
  resolvePermissionAction,
  getPermissionRuleForTool,
} from "../../src/shared/permissions/modes";

// Rule shape constants (mirror the ones in tool-permission-registry.ts so the
// test pins classifications independently of the constant names).
const READ_ONLY = { ask: "allow", edit_auto: "allow", auto: "allow", readonly: "allow" };
const SHELL = { ask: "ask", edit_auto: "ask", auto: "allow", readonly: "deny" };
const FILE_MUTATION = { ask: "ask", edit_auto: "allow", auto: "allow", readonly: "deny" };
const DESTRUCTIVE = { ask: "ask", edit_auto: "ask", auto: "allow", readonly: "deny" };

describe("tool permission registry — classifications", () => {
  it("classifies latex-compile as FILE_MUTATION (writes compile artifacts)", () => {
    const entry = TOOL_PERMISSION_REGISTRY["latex-compile"];
    expect(entry).toBeDefined();
    expect(entry.permissionGroup).toBe("file_write");
    expect(entry.rules).toEqual(FILE_MUTATION);
  });

  it("classifies latex-compile-standalone as FILE_MUTATION", () => {
    const entry = TOOL_PERMISSION_REGISTRY["latex-compile-standalone"];
    expect(entry).toBeDefined();
    expect(entry.permissionGroup).toBe("file_write");
    expect(entry.rules).toEqual(FILE_MUTATION);
  });

  it("classifies typst-compile as FILE_MUTATION", () => {
    const entry = TOOL_PERMISSION_REGISTRY["typst-compile"];
    expect(entry).toBeDefined();
    expect(entry.permissionGroup).toBe("file_write");
    expect(entry.rules).toEqual(FILE_MUTATION);
  });

  it("classifies bash as SHELL", () => {
    expect(TOOL_PERMISSION_REGISTRY["bash"].permissionGroup).toBe("shell");
    expect(TOOL_PERMISSION_REGISTRY["bash"].rules).toEqual(SHELL);
  });

  it("classifies read-only tools as READ_ONLY", () => {
    const readOnly = [
      "read",
      "grep",
      "glob",
      "webfetch",
      "websearch",
      "question",
      "task",
      "skill",
      "todowrite",
      "literature-search",
      "literature-read",
      "literature-read-pdf",
      "literature-stage",
      "citation-health",
      "latex-root",
      "typst-root",
    ];
    for (const tool of readOnly) {
      const entry = TOOL_PERMISSION_REGISTRY[tool];
      expect(entry, `expected ${tool} in registry`).toBeDefined();
      expect(entry.rules).toEqual(READ_ONLY);
    }
  });

  it("classifies destructive tools as DESTRUCTIVE (deny in readonly, ask otherwise)", () => {
    const destructive = ["delete", "move", "literature-delete"];
    for (const tool of destructive) {
      const entry = TOOL_PERMISSION_REGISTRY[tool];
      expect(entry, `expected ${tool} in registry`).toBeDefined();
      expect(entry.permissionGroup).toBe("file_write");
      expect(entry.rules).toEqual(DESTRUCTIVE);
    }
  });

  it("classifies file-mutation tools as FILE_MUTATION (allow in auto, deny in readonly)", () => {
    // edit/write/literature-add/literature-export-bib are group "file_write";
    // apply_patch is group "patch" (same FILE_MUTATION rules, different confirmUx).
    const fileWrite = ["edit", "write", "literature-add", "literature-export-bib"];
    for (const tool of fileWrite) {
      const entry = TOOL_PERMISSION_REGISTRY[tool];
      expect(entry, `expected ${tool} in registry`).toBeDefined();
      expect(entry.permissionGroup).toBe("file_write");
      expect(entry.rules).toEqual(FILE_MUTATION);
    }
    const patch = TOOL_PERMISSION_REGISTRY["apply_patch"];
    expect(patch.permissionGroup).toBe("patch");
    expect(patch.rules).toEqual(FILE_MUTATION);
  });
});

describe("tool permission registry — resolution", () => {
  it("resolves latex-compile rules per mode (the A1 fix)", () => {
    expect(getPermissionRuleForTool("ask", "latex-compile")).toBe("ask");
    expect(getPermissionRuleForTool("edit_auto", "latex-compile")).toBe("allow");
    expect(getPermissionRuleForTool("auto", "latex-compile")).toBe("allow");
    expect(getPermissionRuleForTool("readonly", "latex-compile")).toBe("deny");
  });

  it("resolves latex-compile actions via smart policy", () => {
    // No bash cwd/command context — empty shell gate is allow (nothing to review).
    expect(resolvePermissionAction("ask", "latex-compile")).toBe("allow");
    expect(resolvePermissionAction("edit_auto", "latex-compile")).toBe("allow");
    expect(resolvePermissionAction("auto", "latex-compile")).toBe("allow");
    expect(resolvePermissionAction("readonly", "latex-compile")).toBe("deny");

    // In-project compile cwd → allow even in ask mode.
    expect(
      resolvePermissionAction("ask", "latex-compile", undefined, {
        projectRoot: "/proj",
        bashCwd: "/proj/manuscript",
      }),
    ).toBe("allow");
  });

  it("emits latex-compile rule in buildPermissionRulesForMode for every mode", () => {
    expect(buildPermissionRulesForMode("ask")["latex-compile"]).toBe("ask");
    expect(buildPermissionRulesForMode("edit_auto")["latex-compile"]).toBe("allow");
    expect(buildPermissionRulesForMode("auto")["latex-compile"]).toBe("allow");
    expect(buildPermissionRulesForMode("readonly")["latex-compile"]).toBe("deny");
  });

  it("getToolPermissionEntry falls back for write*/edit*/apply_patch*/lsp-* prefixes", () => {
    expect(getToolPermissionEntry("write123")?.permissionGroup).toBe("file_write");
    expect(getToolPermissionEntry("editXYZ")?.permissionGroup).toBe("file_write");
    expect(getToolPermissionEntry("apply_patch_foo")?.permissionGroup).toBe("patch");
    const lsp = getToolPermissionEntry("lsp-go-to-definition");
    expect(lsp?.permissionGroup).toBe("read");
    expect(lsp?.rules.readonly).toBe("allow");
  });

  it("returns undefined for unknown tools without a matching prefix", () => {
    expect(getToolPermissionEntry("totally-unknown-tool")).toBeUndefined();
  });
});
