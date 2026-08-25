import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolvePushRemote } from "../../shared/git";
import { listRemotes, readBranchPushRemote } from "./remotes";
import type { GitBranchesResult, GitPushResult, GitResult } from "./types";
import { execGit, execGitOrNull } from "./exec";

/**
 * List all local branches.
 */
export async function getBranches(projectRoot: string): Promise<GitBranchesResult> {
  if (!existsSync(join(projectRoot, ".git"))) {
    return { current: "", branches: [] };
  }
  const output = await execGit(projectRoot, ["branch", "--list"]);

  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  let current = "";
  const branches: string[] = [];

  for (const line of lines) {
    // `git branch --list` inside a linked worktree prefixes branches
    // checked out in other worktrees with "+ " (e.g. "+ main").
    // Strip both "* " (current) and "+ " (other-worktree) prefixes.
    if (line.startsWith("* ")) {
      current = line.slice(2).trim();
      branches.push(current);
    } else if (line.startsWith("+ ")) {
      branches.push(line.slice(2).trim());
    } else {
      branches.push(line.trim());
    }
  }

  if (!current && branches.length === 0) {
    // Try getting current branch another way
    try {
      current = (await execGit(projectRoot, ["branch", "--show-current"])).trim();
      if (current) branches.push(current);
    } catch {
      current = "(no branch)";
    }
  }

  return { current: current || "(no branch)", branches };
}

/**
 * Switch to a branch. Tries `git switch` first (modern, branch-only),
 * falls back to `git checkout` for older git versions.
 */
export async function checkoutBranch(projectRoot: string, branch: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["switch", branch]);
    return { success: true };
  } catch {
    try {
      await execGit(projectRoot, ["checkout", branch]);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  }
}

/**
 * Create a new branch and switch to it: `git checkout -b <branchName>`
 */
export async function createBranch(projectRoot: string, branchName: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["checkout", "-b", branchName]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Push current branch to its upstream, or publish with `git push -u <remote>`.
 * Does not hardcode `origin` — see resolvePushRemote.
 */
export async function pushBranch(
  projectRoot: string,
  opts: { remote?: string } = {},
): Promise<GitPushResult> {
  try {
    const branch = (await execGit(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (!branch || branch === "HEAD") {
      return { success: false, error: "Detached HEAD — cannot push" };
    }

    const [upstream, remotes, branchPushRemote] = await Promise.all([
      execGitOrNull(projectRoot, ["rev-parse", "--abbrev-ref", "@{upstream}"]),
      listRemotes(projectRoot),
      readBranchPushRemote(projectRoot, branch),
    ]);

    const decision = resolvePushRemote({
      remotes,
      hasUpstream: Boolean(upstream?.trim()),
      isDetached: false,
      branchPushRemote,
      explicitRemote: opts.remote,
    });

    if (decision.kind === "detached") {
      return { success: false, error: "Detached HEAD — cannot push" };
    }
    if (decision.kind === "no-remote") {
      return {
        success: false,
        error: "No remote configured. Run: git remote add origin <url>",
      };
    }
    if (decision.kind === "choose") {
      return { success: false, needsRemoteChoice: true, remotes: decision.remotes };
    }

    const output =
      decision.kind === "push-upstream"
        ? await execGit(projectRoot, ["push"])
        : await execGit(projectRoot, ["push", "-u", decision.remote, branch]);

    return {
      success: true,
      output: output.trim() || "Pushed successfully.",
      publishedRemote: decision.kind === "publish" ? decision.remote : undefined,
    };
  } catch (err: unknown) {
    const msg = (err as Error).message || "Push failed";
    return { success: false, error: msg, output: msg };
  }
}

export async function deleteBranch(
  projectRoot: string,
  branch: string,
): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["branch", "-D", branch]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
