import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectLifecycleFs } from "../../src/main/project/project-lifecycle-authority";

type IpcHandler = (event: unknown, args?: { rootPath: string }) => Promise<unknown>;
const handlers = new Map<string, IpcHandler>();

const { info, warn, debug, error } = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  ipcMain: { handle: (channel: string, handler: IpcHandler) => handlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => undefined },
  dialog: {},
}));

vi.mock("../../src/main/app/logger", () => ({
  createLogger: () => ({ info, warn, debug, error }),
  shortLogDetail: (value: unknown, max = 160) => {
    const text = value instanceof Error ? value.message : String(value ?? "");
    const line = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
    return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
  },
}));

import { commit, getStatus, gitFailCommand, shouldLogGitFail } from "../../src/main/git/facade";
import { createWorktree } from "../../src/main/git/worktree";
import { registerProjectLifecycleHandlers } from "../../src/main/ipc/project-lifecycle";
import { ProjectLifecycleAuthority } from "../../src/main/project/project-lifecycle-authority";

const dirs: string[] = [];

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function gitFailCalls() {
  return warn.mock.calls.filter((call) => call[0] === "git.fail");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  info.mockReset();
  warn.mockReset();
  debug.mockReset();
  error.mockReset();
  handlers.clear();
});

describe("git fail command names", () => {
  it("names user-facing verbs and worktree add/remove", () => {
    expect(gitFailCommand(["commit", "-m", "secret"])).toBe("commit");
    expect(gitFailCommand(["worktree", "add", "-b", "wt-x", "path"])).toBe("worktree add");
    expect(shouldLogGitFail(["commit", "-m", "secret"])).toBe(true);
    expect(shouldLogGitFail(["worktree", "add", "path"])).toBe(true);
    expect(shouldLogGitFail(["worktree", "remove", "path"])).toBe(true);
    expect(shouldLogGitFail(["status", "--porcelain", "-b"])).toBe(false);
    expect(shouldLogGitFail(["rev-parse", "HEAD"])).toBe(false);
    expect(shouldLogGitFail(["worktree", "list", "--porcelain"])).toBe(false);
    expect(shouldLogGitFail(["branch", "-D", "wt-x"])).toBe(false);
  });
});

describe("L3 project / git / worktree logs", () => {
  it("logs git.fail on a user-facing commit, without the commit message", async () => {
    const project = tmp("prism-git-commit-");
    const result = await commit(project, "secret-commit-message");
    expect(result.success).toBe(false);
    expect(gitFailCalls()).toHaveLength(1);
    expect(gitFailCalls()[0][1]).toEqual(
      expect.objectContaining({
        cmd: "commit",
        project: expect.any(String),
      }),
    );
    expect(JSON.stringify(gitFailCalls())).not.toContain("secret-commit-message");
  });

  it("does not warn git.fail when status fails as a probe", async () => {
    const project = tmp("prism-git-status-");
    await expect(getStatus(project)).rejects.toThrow();
    expect(gitFailCalls()).toHaveLength(0);
  });

  it("logs worktree.fail when creating a worktree outside a git repo", async () => {
    const project = tmp("prism-wt-fail-");
    await expect(createWorktree(project, "calm-owl")).rejects.toThrow(/Git repository required/);
    expect(warn).toHaveBeenCalledWith(
      "worktree.fail",
      expect.objectContaining({
        op: "create",
        name: "calm-owl",
        project: expect.any(String),
      }),
    );
  });

  it("logs project.activate and project.close with basenames", async () => {
    const home = "/fake-home";
    const project = `${home}/research`;
    const fs: ProjectLifecycleFs = {
      realpath: async (path) => {
        if (path === home || path === project) return path;
        throw new Error(`ENOENT: ${path}`);
      },
      stat: async () => ({ isDirectory: () => true }),
    };
    const authority = new ProjectLifecycleAuthority({ homeDir: home, fs });
    registerProjectLifecycleHandlers(
      { stopWatching: async () => undefined },
      authority,
    );

    await expect(handlers.get("project:activate")!({}, { rootPath: project })).resolves.toEqual({
      rootPath: project,
    });
    expect(info).toHaveBeenCalledWith(
      "project.activate",
      expect.objectContaining({ to: "research" }),
    );

    await expect(handlers.get("project:close")!({})).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      "project.close",
      expect.objectContaining({ project: "research" }),
    );
  });

  it("warns project.activate when resolveRoot fails", async () => {
    const home = "/fake-home";
    const fs: ProjectLifecycleFs = {
      realpath: async (path) => {
        if (path === home) return path;
        throw new Error(`ENOENT: ${path}`);
      },
      stat: async () => ({ isDirectory: () => true }),
    };
    const authority = new ProjectLifecycleAuthority({ homeDir: home, fs });
    registerProjectLifecycleHandlers(
      { stopWatching: async () => undefined },
      authority,
    );

    await expect(
      handlers.get("project:activate")!({}, { rootPath: `${home}/missing` }),
    ).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "project.activate",
      expect.objectContaining({ to: "missing" }),
    );
  });
});
