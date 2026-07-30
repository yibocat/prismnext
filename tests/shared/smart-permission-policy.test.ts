import { describe, expect, it } from "vitest";
import {
  isPathInsideProject,
  resolveSmartBashAction,
  resolveSmartPermissionAction,
} from "../../src/shared/smart-permission-policy";

const ROOT = "/Users/me/paper";

describe("smart-permission-policy", () => {
  it("allows in-project file writes without prompt", () => {
    expect(resolveSmartPermissionAction({
      toolName: "edit",
      projectRoot: ROOT,
      filePath: "main.tex",
    })).toBe("allow");
  });

  it("prompts for writes outside the project", () => {
    expect(resolveSmartPermissionAction({
      toolName: "write",
      projectRoot: ROOT,
      filePath: "/tmp/outside.tex",
    })).toBe("prompt");
  });

  it("prompts for in-project delete and denies outside delete", () => {
    expect(resolveSmartPermissionAction({
      toolName: "delete",
      projectRoot: ROOT,
      filePath: "old.tex",
    })).toBe("prompt");
    expect(resolveSmartPermissionAction({
      toolName: "delete",
      projectRoot: ROOT,
      filePath: "/tmp/outside.tex",
    })).toBe("deny");
  });

  it("allows in-project move and prompts when destination leaves project", () => {
    expect(resolveSmartPermissionAction({
      toolName: "move",
      projectRoot: ROOT,
      sourcePath: "a.tex",
      destinationPath: "drafts/a.tex",
    })).toBe("allow");
    expect(resolveSmartPermissionAction({
      toolName: "move",
      projectRoot: ROOT,
      sourcePath: "a.tex",
      destinationPath: "/tmp/a.tex",
    })).toBe("prompt");
  });

  it("auto-allows git and package installs inside project bash cwd", () => {
    expect(resolveSmartBashAction("git commit -m test", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("pnpm install lodash", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("git status", ROOT, ROOT)).toBe("allow");
  });

  it("allows read-only bash outside project but prompts installs", () => {
    expect(resolveSmartBashAction("git status", ROOT, "/tmp")).toBe("allow");
    expect(resolveSmartBashAction("pip install numpy", ROOT, "/tmp")).toBe("prompt");
    expect(resolveSmartBashAction("rm -rf /tmp/x", ROOT, "/tmp")).toBe("deny");
  });

  it("auto-allows experiment-run inside project cwd", () => {
    expect(resolveSmartPermissionAction({
      toolName: "experiment-run",
      projectRoot: ROOT,
      bashCwd: ROOT,
    })).toBe("allow");
  });

  it("resolves nested project paths", () => {
    expect(isPathInsideProject(`${ROOT}/main.tex`, ROOT)).toBe(true);
    expect(isPathInsideProject("/etc/hosts", ROOT)).toBe(false);
  });
});
