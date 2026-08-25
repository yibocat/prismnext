import { beforeEach, describe, expect, it, vi } from "vitest";

const { execGit, execGitOrNull } = vi.hoisted(() => ({
  execGit: vi.fn(),
  execGitOrNull: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
}));

vi.mock("../../src/main/git/exec", () => ({
  execGit,
  execGitOrNull,
}));

import {
  fetchGitArgs,
  fetchRemote,
  isFastForwardPullError,
  pullRemote,
  resolveFetchTarget,
} from "../../src/main/git/sync";

describe("resolveFetchTarget / fetchGitArgs", () => {
  it("fetches all remotes when asked", () => {
    expect(resolveFetchTarget(["origin", "gitea"], null, { all: true })).toEqual({
      kind: "all",
    });
    expect(fetchGitArgs({ kind: "all" })).toEqual(["fetch", "--all", "--prune"]);
  });

  it("uses an explicit remote", () => {
    expect(resolveFetchTarget(["origin", "gitea"], "origin", { remote: "gitea" })).toEqual({
      kind: "remote",
      name: "gitea",
    });
    expect(fetchGitArgs({ kind: "remote", name: "gitea" })).toEqual([
      "fetch",
      "--prune",
      "gitea",
    ]);
  });

  it("prefers the tracking remote, then origin, then the only remote", () => {
    expect(resolveFetchTarget(["lab", "origin"], "lab", {})).toEqual({
      kind: "remote",
      name: "lab",
    });
    expect(resolveFetchTarget(["lab", "origin"], null, {})).toEqual({
      kind: "remote",
      name: "origin",
    });
    expect(resolveFetchTarget(["gitea"], null, {})).toEqual({
      kind: "remote",
      name: "gitea",
    });
  });

  it("noops when there is nothing to fetch", () => {
    expect(resolveFetchTarget([], null, {})).toEqual({ kind: "noop" });
    expect(resolveFetchTarget([], null, { all: true })).toEqual({ kind: "noop" });
    expect(fetchGitArgs({ kind: "noop" })).toBeNull();
  });
});

describe("isFastForwardPullError", () => {
  it("recognizes common git ff-only failures", () => {
    expect(isFastForwardPullError("Not possible to fast-forward, aborting.")).toBe(true);
    expect(isFastForwardPullError("fatal: Not possible to fast-forward")).toBe(true);
    expect(isFastForwardPullError("fatal: Need to specify how to reconcile diverging branches.")).toBe(true);
    expect(isFastForwardPullError("Authentication failed")).toBe(false);
  });
});

describe("fetchRemote / pullRemote", () => {
  beforeEach(() => {
    execGit.mockReset();
    execGitOrNull.mockReset();
  });

  it("fetches the named remote with --prune", async () => {
    execGitOrNull.mockResolvedValue("origin\ngitea\n");
    execGit.mockResolvedValue("From example\n");
    const result = await fetchRemote("/repo", { remote: "gitea" });
    expect(result).toEqual({ success: true, output: "From example" });
    expect(execGit).toHaveBeenCalledWith("/repo", ["fetch", "--prune", "gitea"]);
  });

  it("returns noop when the repo has no remotes", async () => {
    execGitOrNull.mockResolvedValue("");
    const result = await fetchRemote("/repo");
    expect(result.success).toBe(true);
    expect(result.noop).toBe(true);
    expect(execGit).not.toHaveBeenCalled();
  });

  it("pulls with --ff-only when upstream exists", async () => {
    execGitOrNull.mockResolvedValue("origin/master");
    execGit.mockResolvedValue("Already up to date.\n");
    const result = await pullRemote("/repo");
    expect(result).toEqual({ success: true, output: "Already up to date." });
    expect(execGit).toHaveBeenCalledWith("/repo", ["pull", "--ff-only"]);
  });

  it("refuses to pull without an upstream", async () => {
    execGitOrNull.mockResolvedValue(null);
    const result = await pullRemote("/repo");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No upstream/i);
    expect(execGit).not.toHaveBeenCalled();
  });

  it("returns stderr when ff-only pull fails", async () => {
    execGitOrNull.mockResolvedValue("origin/master");
    execGit.mockRejectedValue(new Error("Not possible to fast-forward, aborting."));
    const result = await pullRemote("/repo");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fast-forward/);
    expect(isFastForwardPullError(result.error ?? "")).toBe(true);
  });
});
