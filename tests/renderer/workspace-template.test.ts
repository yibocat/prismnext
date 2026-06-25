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
});
