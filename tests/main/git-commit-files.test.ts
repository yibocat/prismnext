import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
}));

import { getCommitFiles } from "../../src/main/git/log";
import { getDiffStats } from "../../src/main/git/status";

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

function initRepo(dir: string): void {
  git(dir, "init", "-b", "master", "--template=");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
}

describe("getCommitFiles", () => {
  it("lists added files and line counts on the root commit", async () => {
    const dir = tmp("prism-git-root-files-");
    initRepo(dir);
    writeFileSync(join(dir, "readme.md"), "one\ntwo\nthree\n");
    git(dir, "add", "readme.md");
    git(dir, "commit", "-m", "Initial project setup");
    const hash = git(dir, "rev-parse", "--short=7", "HEAD").trim();

    const files = await getCommitFiles(dir, hash);
    const readme = files.find((f) => f.path === "readme.md");
    expect(readme).toBeDefined();
    expect(readme?.added).toBe(3);
    expect(readme?.deleted).toBe(0);
  });

  it("lists deleted files and line counts on a later commit", async () => {
    const dir = tmp("prism-git-delete-files-");
    initRepo(dir);
    writeFileSync(join(dir, "keep.md"), "keep\n");
    writeFileSync(join(dir, "gone.md"), "a\nb\n");
    git(dir, "add", "keep.md", "gone.md");
    git(dir, "commit", "-m", "init");
    unlinkSync(join(dir, "gone.md"));
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "remove gone");
    const hash = git(dir, "rev-parse", "--short=7", "HEAD").trim();

    const files = await getCommitFiles(dir, hash);
    const gone = files.find((f) => f.path === "gone.md");
    expect(gone).toBeDefined();
    expect(gone?.added).toBe(0);
    expect(gone?.deleted).toBe(2);
  });
});

describe("getDiffStats", () => {
  it("counts lines on untracked new files and unstaged deletes", async () => {
    const dir = tmp("prism-git-diff-stats-");
    initRepo(dir);
    writeFileSync(join(dir, "old.md"), "alpha\nbeta\n");
    git(dir, "add", "old.md");
    git(dir, "commit", "-m", "init");

    writeFileSync(join(dir, "fresh.md"), "x\ny\nz\n");
    unlinkSync(join(dir, "old.md"));

    const stats = await getDiffStats(dir);
    expect(stats.unstaged["fresh.md"]).toEqual({ added: 3, deleted: 0 });
    expect(stats.unstaged["old.md"]).toEqual({ added: 0, deleted: 2 });
  });
});
