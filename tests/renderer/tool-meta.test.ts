import { describe, it, expect } from "vitest";
import { getToolMeta, usesProposedChange, shouldTrackProposedChange, isPatchTool, isDiskMutationTool, extractPatchTargetPaths } from "../../src/renderer/components/modules/chat/tools/tool-meta";

describe("tool-meta", () => {
  it("maps destructive tools to permission confirm UX", () => {
    expect(getToolMeta("edit")).toMatchObject({
      permissionGroup: "file_write",
      confirmUx: "diff",
      usesProposedChange: true,
    });
    expect(getToolMeta("bash")).toMatchObject({
      permissionGroup: "shell",
      confirmUx: "command",
    });
    expect(getToolMeta("apply_patch")).toMatchObject({
      permissionGroup: "patch",
      confirmUx: "patch",
    });
  });

  it("maps read-only tools to none confirm UX", () => {
    expect(getToolMeta("read").confirmUx).toBe("none");
    expect(getToolMeta("grep").confirmUx).toBe("none");
  });

  it("detects proposed-change tools", () => {
    expect(usesProposedChange("write")).toBe(true);
    expect(usesProposedChange("bash")).toBe(false);
  });

  it("tracks proposed changes only in ask mode for file writes", () => {
    expect(shouldTrackProposedChange("ask", "edit")).toBe(true);
    expect(shouldTrackProposedChange("auto", "edit")).toBe(false);
    expect(shouldTrackProposedChange("readonly", "write")).toBe(false);
    expect(shouldTrackProposedChange("auto", "bash")).toBe(false);
    expect(shouldTrackProposedChange("auto", "apply_patch")).toBe(false);
  });

  it("classifies disk mutation tools", () => {
    expect(isDiskMutationTool("edit")).toBe(true);
    expect(isDiskMutationTool("write")).toBe(true);
    expect(isPatchTool("apply_patch")).toBe(true);
    expect(isPatchTool("patch")).toBe(true);
    expect(isDiskMutationTool("apply_patch")).toBe(true);
    expect(isDiskMutationTool("bash")).toBe(false);
  });

  it("extracts patch target paths from unified diff", () => {
    const patch = [
      "diff --git a/src/main.tex b/src/main.tex",
      "--- a/src/main.tex",
      "+++ b/src/main.tex",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");
    expect(extractPatchTargetPaths({ patch })).toEqual(["src/main.tex"]);
  });

  it("extracts multiple paths and explicit file_path", () => {
    const patch = [
      "diff --git a/a.tex b/a.tex",
      "+++ b/a.tex",
      "diff --git a/b.tex b/b.tex",
      "+++ b/b.tex",
    ].join("\n");
    expect(extractPatchTargetPaths({ file_path: "extra.tex", patch })).toEqual([
      "extra.tex",
      "a.tex",
      "b.tex",
    ]);
  });
});
