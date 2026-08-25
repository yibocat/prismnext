import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
}));

import {
  buildTracking,
  parsePorcelainHeader,
  parseRemoteNames,
  resolveRemoteName,
} from "../../src/shared/git/tracking";
import { getStatus } from "../../src/main/git/status";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_TEMPLATE_DIR: "" },
  });
}

describe("parsePorcelainHeader", () => {
  it("parses a local-only branch", () => {
    expect(parsePorcelainHeader("## master")).toEqual({
      branch: "master",
      isDetached: false,
      upstreamRef: null,
      aheadCount: 0,
      behindCount: 0,
    });
  });

  it("parses a slashed feature branch without upstream", () => {
    expect(parsePorcelainHeader("## feat/foo").branch).toBe("feat/foo");
  });

  it("parses in-sync tracking without counts", () => {
    expect(parsePorcelainHeader("## master...origin/master")).toEqual({
      branch: "master",
      isDetached: false,
      upstreamRef: "origin/master",
      aheadCount: 0,
      behindCount: 0,
    });
  });

  it("parses ahead and behind together", () => {
    expect(parsePorcelainHeader("## feat/foo...origin/feat/foo [ahead 2, behind 1]")).toEqual({
      branch: "feat/foo",
      isDetached: false,
      upstreamRef: "origin/feat/foo",
      aheadCount: 2,
      behindCount: 1,
    });
  });

  it("parses ahead-only and behind-only", () => {
    expect(parsePorcelainHeader("## master...origin/master [ahead 3]").aheadCount).toBe(3);
    expect(parsePorcelainHeader("## master...origin/master [behind 4]").behindCount).toBe(4);
  });

  it("parses a non-origin remote name in the upstream ref", () => {
    expect(parsePorcelainHeader("## paper...gitea/paper").upstreamRef).toBe("gitea/paper");
  });

  it("parses detached HEAD", () => {
    expect(parsePorcelainHeader("## HEAD (no branch)")).toMatchObject({
      branch: "HEAD",
      isDetached: true,
      upstreamRef: null,
    });
  });

  it("parses an empty unborn branch name", () => {
    expect(parsePorcelainHeader("## No commits yet on main")).toMatchObject({
      branch: "main",
      isDetached: false,
      upstreamRef: null,
    });
  });

  it("parses unborn branch with a gone upstream", () => {
    expect(parsePorcelainHeader("## No commits yet on main...origin/main [gone]")).toMatchObject({
      branch: "main",
      upstreamRef: "origin/main",
      aheadCount: 0,
      behindCount: 0,
    });
  });
});

describe("resolveRemoteName / buildTracking", () => {
  it("matches the longest remote prefix", () => {
    expect(resolveRemoteName("gitea/feat/x", ["gitea", "origin"])).toBe("gitea");
    expect(resolveRemoteName("origin/master", ["origin"])).toBe("origin");
  });

  it("falls back to the first path segment when remotes are unknown", () => {
    expect(resolveRemoteName("lab/paper", [])).toBe("lab");
  });

  it("prefers origin when there is no upstream", () => {
    expect(resolveRemoteName(null, ["gitea", "origin"])).toBe("origin");
    expect(resolveRemoteName(null, ["gitea"])).toBe("gitea");
  });

  it("sets hasRemote from remotes or from an upstream ref", () => {
    const header = parsePorcelainHeader("## master...origin/master [ahead 1]");
    expect(buildTracking(header, []).hasRemote).toBe(true);
    expect(buildTracking(parsePorcelainHeader("## master"), []).hasRemote).toBe(false);
    expect(buildTracking(parsePorcelainHeader("## master"), ["origin"]).hasRemote).toBe(true);
  });

  it("splits remote names on newlines", () => {
    expect(parseRemoteNames("origin\ngitea\n")).toEqual(["origin", "gitea"]);
    expect(parseRemoteNames(null)).toEqual([]);
  });
});

describe("getStatus tracking", () => {
  it("reports no remote on a fresh local repo", async () => {
    const dir = tmp("prism-git-track-local-");
    git(dir, "init", "-b", "master", "--template=");
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "user.name", "Test");
    writeFileSync(join(dir, "a.txt"), "a\n");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-m", "init");

    const status = await getStatus(dir);
    expect(status.branch).toBe("master");
    expect(status.tracking).toMatchObject({
      upstreamRef: null,
      hasRemote: false,
      isDetached: false,
      aheadCount: 0,
      behindCount: 0,
    });
  });

  it("reports ahead of a simulated origin tracking ref", async () => {
    const dir = tmp("prism-git-track-ahead-");
    git(dir, "init", "-b", "master", "--template=");
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "user.name", "Test");
    git(dir, "commit", "--allow-empty", "-m", "init");
    git(dir, "remote", "add", "origin", "https://example.com/paper.git");
    git(dir, "update-ref", "refs/remotes/origin/master", "HEAD");
    git(dir, "branch", "--set-upstream-to=origin/master");
    git(dir, "commit", "--allow-empty", "-m", "local");

    const status = await getStatus(dir);
    expect(status.tracking.hasRemote).toBe(true);
    expect(status.tracking.remoteName).toBe("origin");
    expect(status.tracking.upstreamRef).toBe("origin/master");
    expect(status.tracking.aheadCount).toBe(1);
    expect(status.tracking.behindCount).toBe(0);
  });
});
