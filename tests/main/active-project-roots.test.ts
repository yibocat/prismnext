import { describe, it, expect, beforeEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  registerProjectRoot,
  registerWorkspaceRoots,
  replaceRegisteredRoots,
  clearRoots,
  isPathContained,
  isPathUnderHome,
  assertContained,
  assertUnderHome,
  _registeredRoots,
} from "../../src/main/project/active-project-roots";

const HOME = homedir();
const projA = join(HOME, "prism-test-proj-A");
const projAFile = join(projA, "manuscript", "main.tex");
const projB = join(HOME, "prism-test-proj-B");
const projBFile = join(projB, "notes.md");

describe("active-project-roots registry", () => {
  beforeEach(() => {
    clearRoots();
  });

  describe("isSafeRoot / registerProjectRoot", () => {
    it("registers a homedir-relative project root", () => {
      expect(registerProjectRoot(projA)).toBe(true);
      expect(_registeredRoots()).toContain(projA);
    });

    it("rejects / and system directories", () => {
      expect(registerProjectRoot("/")).toBe(false);
      expect(registerProjectRoot("/etc")).toBe(false);
      expect(registerProjectRoot("/System/Library")).toBe(false);
      expect(registerProjectRoot("/usr/bin")).toBe(false);
      expect(registerProjectRoot("/var/log")).toBe(false);
      expect(registerProjectRoot("/bin")).toBe(false);
      expect(_registeredRoots()).toHaveLength(0);
    });

    it("rejects paths outside homedir", () => {
      expect(registerProjectRoot("/Volumes/external/papers")).toBe(false);
      expect(registerProjectRoot("/tmp/proj")).toBe(false);
    });

    it("rejects relative paths and empty input", () => {
      expect(registerProjectRoot("relative/path")).toBe(false);
      expect(registerProjectRoot("")).toBe(false);
    });

    it("ignores remote:// workbench members without a security warning path", () => {
      expect(registerProjectRoot("remote://lab/home/ubuntu/project-test-1")).toBe(false);
      replaceRegisteredRoots([projA, "remote://lab/home/ubuntu/project-test-1"]);
      expect(_registeredRoots()).toEqual([projA]);
    });

    it("rejects the home directory itself", () => {
      expect(registerProjectRoot(HOME)).toBe(false);
    });
  });

  describe("isPathContained (mutations)", () => {
    it("allows paths under a registered root", () => {
      registerProjectRoot(projA);
      expect(isPathContained(projAFile)).toBe(true);
      expect(isPathContained(projA)).toBe(true); // root itself
      expect(isPathContained(join(projA, ".workbench", "compile", "main.pdf"))).toBe(true);
    });

    it("blocks paths under a different (unregistered) project", () => {
      registerProjectRoot(projA);
      expect(isPathContained(projBFile)).toBe(false);
    });

    it("blocks homedir paths outside the project (e.g. ~/.ssh)", () => {
      registerProjectRoot(projA);
      expect(isPathContained(join(HOME, ".ssh", "id_rsa"))).toBe(false);
      expect(isPathContained(join(HOME, ".zshrc"))).toBe(false);
    });

    it("blocks system paths regardless of registration", () => {
      registerProjectRoot(projA);
      expect(isPathContained("/etc/passwd")).toBe(false);
      expect(isPathContained("/System/Library/Keychains/System.keychain")).toBe(false);
    });

    it("blocks when no root is registered", () => {
      expect(isPathContained(projAFile)).toBe(false);
    });

    it("clearRoots empties the registry", () => {
      registerProjectRoot(projA);
      expect(isPathContained(projAFile)).toBe(true);
      clearRoots();
      expect(isPathContained(projAFile)).toBe(false);
    });

    it("re-registering after clear replaces the active root (project switch)", () => {
      registerProjectRoot(projA);
      expect(isPathContained(projAFile)).toBe(true);
      clearRoots();
      registerProjectRoot(projB);
      expect(isPathContained(projAFile)).toBe(false); // A no longer active
      expect(isPathContained(projBFile)).toBe(true);  // B now active
    });

    it("replaceRegisteredRoots keeps every workbench member contained", () => {
      replaceRegisteredRoots([projA, projB]);
      expect(isPathContained(projAFile)).toBe(true);
      expect(isPathContained(projBFile)).toBe(true);
      expect(_registeredRoots()).toEqual([projA, projB].sort());

      replaceRegisteredRoots([projB]);
      expect(isPathContained(projAFile)).toBe(false);
      expect(isPathContained(projBFile)).toBe(true);
    });
  });

  describe("registerWorkspaceRoots", () => {
    it("registers safe roots and skips unsafe ones", () => {
      registerWorkspaceRoots([projA, "/etc", "/Volumes/external"]);
      expect(_registeredRoots()).toEqual([projA]);
    });
  });

  describe("isPathUnderHome (reads / dialog)", () => {
    it("allows homedir paths", () => {
      expect(isPathUnderHome(join(HOME, "Downloads", "x.bib"))).toBe(true);
      expect(isPathUnderHome(projAFile)).toBe(true);
    });

    it("blocks system paths", () => {
      expect(isPathUnderHome("/etc/passwd")).toBe(false);
      expect(isPathUnderHome("/System/Library/x")).toBe(false);
      expect(isPathUnderHome("/var/log/x")).toBe(false);
    });

    it("blocks paths outside home and relative/empty", () => {
      expect(isPathUnderHome("/tmp/x")).toBe(false);
      expect(isPathUnderHome("relative")).toBe(false);
      expect(isPathUnderHome("")).toBe(false);
    });
  });

  describe("assert helpers", () => {
    it("assertContained throws for out-of-project, passes for in-project", () => {
      registerProjectRoot(projA);
      expect(() => assertContained(projAFile, "test")).not.toThrow();
      expect(() => assertContained(join(HOME, ".ssh", "id_rsa"), "test")).toThrow(
        /outside project boundaries/,
      );
      expect(() => assertContained("/etc/passwd", "test")).toThrow(/outside project boundaries/);
    });

    it("assertUnderHome throws for system paths, passes for homedir", () => {
      expect(() => assertUnderHome(join(HOME, "x"), "test")).not.toThrow();
      expect(() => assertUnderHome("/etc/passwd", "test")).toThrow(/outside user home/);
    });
  });
});
