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

  it("auto-allows git writes inside project bash cwd; package installs still ask", () => {
    expect(resolveSmartBashAction("git commit -m test", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("git status", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("pnpm install lodash", ROOT, ROOT)).toBe("prompt");
    expect(resolveSmartBashAction("pip install requests", ROOT, ROOT)).toBe("prompt");
  });

  it("treats cwd outside the project as out of the cage", () => {
    expect(resolveSmartBashAction("git status", ROOT, "/tmp")).toBe("prompt");
    expect(resolveSmartBashAction("make build", ROOT, "/tmp")).toBe("prompt");
    expect(resolveSmartBashAction("pip install numpy", ROOT, "/tmp")).toBe("prompt");
    expect(resolveSmartBashAction("rm -rf /tmp/x", ROOT, "/tmp")).toBe("deny");
  });

  it("allows unlisted in-project bash without naming the command", () => {
    expect(resolveSmartBashAction("make build", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("python train.py", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("pytest", ROOT, ROOT)).toBe("allow");
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

  it("denies whole-disk search even with cwd inside the project", () => {
    expect(resolveSmartBashAction("mdfind -name SKILL.md", ROOT, ROOT)).toBe("deny");
    expect(resolveSmartBashAction("locate foo", ROOT, "/tmp")).toBe("deny");
    expect(resolveSmartBashAction("echo a && mdfind b", ROOT, ROOT)).toBe("deny");
  });

  it("prompts for bash read-verbs carrying outside-project paths (was silent allow)", () => {
    expect(resolveSmartBashAction("cat /elsewhere/SKILL.md", ROOT, ROOT)).toBe("prompt");
    expect(resolveSmartBashAction("cp /elsewhere/render.mjs .", ROOT, ROOT)).toBe("prompt");
    expect(resolveSmartBashAction("cd /elsewhere && cat x.md", ROOT, ROOT)).toBe("prompt");
    // …while in-project usage of the same verbs stays silent.
    expect(resolveSmartBashAction("cat src/a.ts", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("cat notes.md", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("find . -name '*.md'", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("mkdir -p figures/out", ROOT, ROOT)).toBe("allow");
    expect(resolveSmartBashAction("rm figures/old.png", ROOT, ROOT)).toBe("deny");
    expect(resolveSmartBashAction(
      `python3 -c "from PIL import Image; Image.open('a.png').resize((400,400)).save('a.jpg')"`,
      ROOT,
      ROOT,
    )).toBe("deny");
  });

  it("exempts outside bash paths under user allowedPaths", () => {
    expect(resolveSmartBashAction("cat /refs/x.bib", ROOT, ROOT, ["/refs"])).toBe("allow");
  });

  it("reads stay silent allow inside and outside the project (deliberate)", () => {
    expect(resolveSmartPermissionAction({
      toolName: "read",
      projectRoot: ROOT,
      filePath: "main.tex",
    })).toBe("allow");
    // Outside-project reads are an intentional capability (external papers,
    // reference checkouts); only whole-disk search and bash path args gate.
    expect(resolveSmartPermissionAction({
      toolName: "read",
      projectRoot: ROOT,
      filePath: "/elsewhere/repo/SKILL.md",
    })).toBe("allow");
    expect(resolveSmartPermissionAction({
      toolName: "grep",
      projectRoot: ROOT,
      filePath: "/elsewhere/repo",
    })).toBe("allow");
  });
});
