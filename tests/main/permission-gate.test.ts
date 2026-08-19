/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import {
  resolvePermissionAction,
  shouldPromptForPermission,
} from "../../src/main/services/permission-modes";
import { shouldShowPermissionGate } from "../../src/renderer/components/modules/chat/permission-gate-panel";

const ROOT = "/Users/me/paper";

describe("permission gate (smart policy)", () => {
  it("prompts for delete inside project", () => {
    expect(shouldShowPermissionGate(undefined, "delete", {
      projectRoot: ROOT,
      filePath: "old.tex",
    })).toBe(true);
    expect(resolvePermissionAction("edit_auto", "delete", "build", {
      projectRoot: ROOT,
      filePath: "old.tex",
    })).toBe("prompt");
  });

  it("denies delete outside project", () => {
    expect(shouldShowPermissionGate(undefined, "delete", {
      projectRoot: ROOT,
      filePath: "/tmp/x",
    })).toBe(false);
    expect(resolvePermissionAction("edit_auto", "delete", "build", {
      projectRoot: ROOT,
      filePath: "/tmp/x",
    })).toBe("deny");
  });

  it("allows in-project edit without prompt", () => {
    expect(shouldShowPermissionGate(undefined, "edit", {
      projectRoot: ROOT,
      filePath: "main.tex",
    })).toBe(false);
  });

  it("prompts for outside write", () => {
    expect(shouldShowPermissionGate(undefined, "write", {
      projectRoot: ROOT,
      filePath: "/tmp/out.tex",
    })).toBe(true);
  });

  it("allows in-project move without prompt", () => {
    expect(shouldShowPermissionGate(undefined, "move", {
      projectRoot: ROOT,
      sourcePath: "a.tex",
      destinationPath: "drafts/a.tex",
    })).toBe(false);
  });

  it("allows in-project git bash without prompt", () => {
    expect(shouldPromptForPermission("edit_auto", "bash", {
      projectRoot: ROOT,
      bashCommand: "git commit -m x",
      bashCwd: ROOT,
    })).toBe(false);
  });

  it("prompts for in-project mkdir so the composer gate can show Allow/Deny", () => {
    expect(shouldShowPermissionGate(undefined, "bash", {
      projectRoot: ROOT,
      bashCommand: "mkdir -p notes",
      bashCwd: ROOT,
    })).toBe(true);
  });

  it("hides the composer gate when bash has no command (empty command is allow)", () => {
    expect(shouldShowPermissionGate(undefined, "bash", {
      projectRoot: ROOT,
      bashCommand: null,
      bashCwd: ROOT,
    })).toBe(false);
  });

  it("readonly still denies edit and bash", () => {
    expect(resolvePermissionAction("readonly", "edit")).toBe("deny");
    expect(resolvePermissionAction("readonly", "bash")).toBe("deny");
  });
});
