import { describe, it, expect } from "vitest";
import {
  getToolMeta,
  usesProposedChange,
  isPatchTool,
  isFileWriteTool,
  isDiskMutationTool,
  extractPatchTargetPaths,
} from "../../src/renderer/components/modules/chat/tools/tool-meta";

describe("tool-meta", () => {
  it("maps file-write tools to diff confirm UX", () => {
    expect(getToolMeta("edit")).toMatchObject({
      permissionGroup: "file_write",
      confirmUx: "diff",
    });
    expect(getToolMeta("write")).toMatchObject({
      permissionGroup: "file_write",
      confirmUx: "diff",
    });
  });

  it("maps bash to command confirm UX", () => {
    expect(getToolMeta("bash")).toMatchObject({
      permissionGroup: "shell",
      confirmUx: "command",
    });
  });

  it("maps apply_patch to patch confirm UX", () => {
    expect(getToolMeta("apply_patch")).toMatchObject({
      permissionGroup: "patch",
      confirmUx: "patch",
    });
  });

  it("maps read-only tools to none confirm UX", () => {
    expect(getToolMeta("read").confirmUx).toBe("none");
    expect(getToolMeta("grep").confirmUx).toBe("none");
    expect(getToolMeta("glob").confirmUx).toBe("none");
  });

  it("returns default meta for unknown tools", () => {
    expect(getToolMeta("multiedit").confirmUx).toBe("none");
    expect(getToolMeta("list").confirmUx).toBe("none");
  });

  it("maps prism custom delete/move tools", () => {
    expect(getToolMeta("delete")).toMatchObject({
      permissionGroup: "file_write",
      confirmUx: "inline",
    });
    expect(getToolMeta("move")).toMatchObject({
      permissionGroup: "file_write",
      confirmUx: "inline",
    });
    expect(isDiskMutationTool("delete")).toBe(true);
    expect(isDiskMutationTool("move")).toBe(true);
  });

  it("proposed-change review is disabled (scheme A)", () => {
    expect(usesProposedChange("edit")).toBe(false);
    expect(usesProposedChange("write")).toBe(false);
    expect(usesProposedChange("bash")).toBe(false);
  });

  it("classifies file-write and patch tools", () => {
    expect(isFileWriteTool("edit")).toBe(true);
    expect(isFileWriteTool("write")).toBe(true);
    expect(isFileWriteTool("multiedit")).toBe(false); // not an OpenCode tool
    expect(isPatchTool("apply_patch")).toBe(true);
    expect(isPatchTool("patch")).toBe(false); // not an OpenCode tool name
    expect(isDiskMutationTool("edit")).toBe(true);
    expect(isDiskMutationTool("write")).toBe(true);
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
