import { describe, expect, it } from "vitest";
import { getModeShortcutId, MODE_SHORTCUT } from "@/lib/workspace/mode-shortcuts";

describe("mode-shortcuts", () => {
  it("maps workspace modes to split-open shortcut ids", () => {
    expect(getModeShortcutId("files")).toBe("workspace.openFiles");
    expect(getModeShortcutId("terminal")).toBe("workspace.openTerminal");
    expect(getModeShortcutId("git")).toBe("workspace.openGit");
  });

  it("returns undefined for modes without a chord", () => {
    expect(getModeShortcutId("interaction")).toBeUndefined();
    expect(getModeShortcutId("unknown-mode")).toBeUndefined();
  });

  it("covers all add-menu workspace modes that have shortcuts", () => {
    const withShortcuts = Object.keys(MODE_SHORTCUT);
    expect(withShortcuts).toContain("files");
    expect(withShortcuts).toContain("literature");
    expect(withShortcuts).not.toContain("texworkspace");
    expect(withShortcuts).toHaveLength(6);
  });
});
