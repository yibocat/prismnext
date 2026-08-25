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
  execGitOrNull,
  execGit,
}));

import {
  formatRemoteUrlSummary,
  isPlausibleRemoteUrl,
  isValidRemoteName,
  parseRemoteVerbose,
  resolvePushRemote,
  suggestRemoteName,
} from "../../src/shared/git/remotes";
import { addRemote, listRemotes } from "../../src/main/git/remotes";
import { isNonFastForwardPushError } from "../../src/shared/git/tracking";

describe("parseRemoteVerbose / formatRemoteUrlSummary", () => {
  it("dedupes fetch/push lines and prefers the push URL", () => {
    const parsed = parseRemoteVerbose(`
origin	https://github.com/org/paper.git (fetch)
origin	https://github.com/org/paper.git (push)
gitea	git@lab.example.com:team/paper.git (fetch)
gitea	git@lab.example.com:team/paper.git (push)
`);
    expect(parsed).toEqual([
      { name: "origin", url: "https://github.com/org/paper.git" },
      { name: "gitea", url: "git@lab.example.com:team/paper.git" },
    ]);
  });

  it("shortens URLs for the menu", () => {
    expect(formatRemoteUrlSummary("https://github.com/org/paper.git")).toBe("github.com/org/paper");
    expect(formatRemoteUrlSummary("git@lab.example.com:team/paper.git")).toBe(
      "lab.example.com:team/paper",
    );
  });
});

describe("resolvePushRemote", () => {
  const origin = { name: "origin", url: "https://example.com/a.git" };
  const gitea = { name: "gitea", url: "git@lab:team/paper.git" };

  it("refuses detached HEAD and empty remotes", () => {
    expect(resolvePushRemote({ remotes: [origin], hasUpstream: true, isDetached: true }).kind).toBe(
      "detached",
    );
    expect(resolvePushRemote({ remotes: [], hasUpstream: false }).kind).toBe("no-remote");
  });

  it("pushes to upstream when it exists", () => {
    expect(
      resolvePushRemote({ remotes: [origin, gitea], hasUpstream: true }),
    ).toEqual({ kind: "push-upstream" });
  });

  it("honors an explicit remote, then branch.pushRemote, then the only remote, then origin", () => {
    expect(
      resolvePushRemote({ remotes: [origin, gitea], hasUpstream: false, explicitRemote: "gitea" }),
    ).toEqual({ kind: "publish", remote: "gitea" });
    expect(
      resolvePushRemote({
        remotes: [origin, gitea],
        hasUpstream: false,
        branchPushRemote: "gitea",
      }),
    ).toEqual({ kind: "publish", remote: "gitea" });
    expect(resolvePushRemote({ remotes: [gitea], hasUpstream: false })).toEqual({
      kind: "publish",
      remote: "gitea",
    });
    expect(resolvePushRemote({ remotes: [origin, gitea], hasUpstream: false })).toEqual({
      kind: "publish",
      remote: "origin",
    });
  });

  it("asks the UI to choose when several remotes exist and none is origin", () => {
    const lab = { name: "lab", url: "git@lab:x.git" };
    expect(resolvePushRemote({ remotes: [gitea, lab], hasUpstream: false })).toEqual({
      kind: "choose",
      remotes: [gitea, lab],
    });
  });
});

describe("remote name and URL", () => {
  it("accepts ordinary remote names and git URLs", () => {
    expect(isValidRemoteName("origin")).toBe(true);
    expect(isValidRemoteName("lab-1")).toBe(true);
    expect(isValidRemoteName("origin remote")).toBe(false);
    expect(isValidRemoteName("-bad")).toBe(false);
    expect(isPlausibleRemoteUrl("https://github.com/org/paper.git")).toBe(true);
    expect(isPlausibleRemoteUrl("git@github.com:org/paper.git")).toBe(true);
    expect(isPlausibleRemoteUrl("not a url")).toBe(false);
    expect(suggestRemoteName([])).toBe("origin");
    expect(suggestRemoteName(["origin"])).toBe("");
  });
});

describe("listRemotes", () => {
  beforeEach(() => {
    execGitOrNull.mockReset();
    execGit.mockReset();
  });

  it("parses git remote -v", async () => {
    execGitOrNull.mockResolvedValue("origin https://example.com/a.git (fetch)\norigin https://example.com/a.git (push)\n");
    await expect(listRemotes("/repo")).resolves.toEqual([
      { name: "origin", url: "https://example.com/a.git" },
    ]);
    expect(execGitOrNull).toHaveBeenCalledWith("/repo", ["remote", "-v"]);
  });
});

describe("addRemote", () => {
  beforeEach(() => {
    execGitOrNull.mockReset();
    execGit.mockReset();
  });

  it("runs git remote add and returns the new list", async () => {
    execGitOrNull
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(
        "origin https://github.com/org/paper.git (fetch)\norigin https://github.com/org/paper.git (push)\n",
      );
    execGit.mockResolvedValue("");
    await expect(
      addRemote("/repo", { name: "origin", url: "https://github.com/org/paper.git" }),
    ).resolves.toEqual({
      success: true,
      remotes: [{ name: "origin", url: "https://github.com/org/paper.git" }],
    });
    expect(execGit).toHaveBeenCalledWith("/repo", [
      "remote",
      "add",
      "origin",
      "https://github.com/org/paper.git",
    ]);
  });

  it("rejects a duplicate name without calling git remote add", async () => {
    execGitOrNull.mockResolvedValue(
      "origin https://example.com/a.git (fetch)\norigin https://example.com/a.git (push)\n",
    );
    await expect(
      addRemote("/repo", { name: "origin", url: "https://github.com/org/paper.git" }),
    ).resolves.toMatchObject({ success: false, error: "remote_exists" });
    expect(execGit).not.toHaveBeenCalled();
  });
});

describe("isNonFastForwardPushError", () => {
  it("recognizes rejected non-ff pushes", () => {
    expect(isNonFastForwardPushError("! [rejected]        master -> master (non-fast-forward)")).toBe(
      true,
    );
    expect(isNonFastForwardPushError("error: failed to push some refs to 'origin'")).toBe(true);
    expect(isNonFastForwardPushError("Authentication failed")).toBe(false);
  });
});
