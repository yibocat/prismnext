import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateFolderName,
  validateNewTemplateFolder,
  applyTemplateFolderPatch,
} from "@/lib/settings/workspace-template";
import { defaultWorkspaceDirs } from "@/types/workspace";

describe("workspace-template", () => {
  it("rejects invalid folder names", () => {
    expect(validateFolderName("")).toMatch(/empty/i);
    expect(validateFolderName("a/b")).toMatch(/separator/i);
  });

  it("prevents duplicate manuscript in template", () => {
    const dirs = defaultWorkspaceDirs();
    expect(validateNewTemplateFolder(dirs, "manuscript", "paper")).toMatch(/one manuscript/i);
  });

  it("applies description patch", () => {
    const dirs = defaultWorkspaceDirs();
    const next = applyTemplateFolderPatch(dirs, 0, { description: "Custom hint" });
    expect(next[0]?.description).toBe("Custom hint");
  });

  it("Settings Workspace edits the open project only", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/modules/settings/workspace-settings.tsx"),
      "utf-8",
    );
    expect(src).not.toContain("tabTemplate");
    expect(src).not.toContain("<Tabs");
    expect(src).not.toContain("defaultWorkspaceDirs");
    const slots = readFileSync(
      join(import.meta.dirname, "../../src/renderer/lib/settings/settings-panel-slots.ts"),
      "utf-8",
    );
    expect(slots).not.toContain("WorkspaceFolderScope");
    expect(slots).toContain('kind: "workspace-folder"; mode: "edit"');
  });
});
