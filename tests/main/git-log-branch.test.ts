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

import { getCommitFileDiff, getCommitFiles, getLog } from "../../src/main/git/log";

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

describe("getLog branch range", () => {
  it("lists only commits on the feature branch and fills +/- counts", async () => {
    const dir = tmp("prism-git-branch-log-");
    initRepo(dir);
    writeFileSync(join(dir, "base.md"), "one\n");
    git(dir, "add", "base.md");
    git(dir, "commit", "-m", "init on master");
    git(dir, "checkout", "-b", "feat/lens");
    writeFileSync(join(dir, "feat.md"), "a\nb\nc\n");
    git(dir, "add", "feat.md");
    git(dir, "commit", "-m", "add feat file");

    const head = await getLog(dir, 10);
    expect(head.some((c) => c.message.includes("init on master"))).toBe(true);

    const branchOnly = await getLog(dir, {
      range: "branch",
      baseBranch: "master",
      maxCount: 20,
    });
    expect(branchOnly).toHaveLength(1);
    expect(branchOnly[0]?.message).toContain("add feat file");
    expect(branchOnly[0]?.insertions).toBe(3);
    expect(branchOnly[0]?.deletions).toBe(0);
  });

  it("summarizes Branch Changes as the net default...HEAD diff, not the sum of commits", async () => {
    const dir = tmp("prism-git-branch-range-");
    initRepo(dir);
    writeFileSync(join(dir, "base.md"), "one\n");
    git(dir, "add", "base.md");
    git(dir, "commit", "-m", "init on master");
    git(dir, "checkout", "-b", "feat/range");
    writeFileSync(join(dir, "feat.md"), "a\nb\nc\n");
    git(dir, "add", "feat.md");
    git(dir, "commit", "-m", "add three lines");
    writeFileSync(join(dir, "feat.md"), "a\n");
    git(dir, "add", "feat.md");
    git(dir, "commit", "-m", "keep one line");

    const files = await getCommitFiles(dir, "master...HEAD");
    expect(files).toEqual([{ path: "feat.md", added: 1, deleted: 0 }]);

    const diff = await getCommitFileDiff(dir, "master...HEAD", "feat.md");
    expect(diff.oldContent).toBe("");
    expect(diff.newContent).toBe("a\n");
  });
});
