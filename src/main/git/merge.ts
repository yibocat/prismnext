import type { GitResult } from "./types";
import { execGit } from "./exec";

/**
 * Merge a branch into the current branch: `git merge <branch>`
 * Returns the merge output on success, or the conflict details on failure.
 */
export async function mergeBranch(
  projectRoot: string,
  sourceBranch: string,
): Promise<GitResult & { output?: string }> {
  try {
    const output = await execGit(projectRoot, ["merge", sourceBranch]);
    return { success: true, output: output.trim() || "Already up to date." };
  } catch (err: unknown) {
    // git merge exits non-zero on conflicts — capture the output for user feedback
    const msg = (err as Error).message || "Merge failed";
    // The error message often contains useful git output (conflict file list)
    return { success: false, error: msg, output: msg };
  }
}

/**
 * Merge a branch without auto-committing: `git merge --no-commit --no-ff <branch>`
 * This applies all changes from sourceBranch into the current branch as staged
 * changes, leaving the user free to review and commit (or abort) manually.
 *
 * --no-ff ensures a merge commit is always created (when the user commits),
 * preserving the worktree branch history.
 */
export async function mergeNoCommit(
  projectRoot: string,
  sourceBranch: string,
): Promise<GitResult & { output?: string }> {
  try {
    const output = await execGit(projectRoot, ["merge", "--no-commit", "--no-ff", sourceBranch]);
    return { success: true, output: output.trim() || "Changes staged — review and commit to finalize." };
  } catch (err: unknown) {
    const msg = (err as Error).message || "Merge failed";
    return { success: false, error: msg, output: msg };
  }
}

/**
 * Abort an in-progress merge: `git merge --abort`
 */
export async function abortMerge(projectRoot: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["merge", "--abort"]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Stash local changes (including untracked): `git stash push -u -m <message>`
 */
export async function stashPush(projectRoot: string, message?: string): Promise<GitResult> {
  try {
    const args = ["stash", "push", "-u"];
    if (message) args.push("-m", message);
    await execGit(projectRoot, args);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Pop the most recent stash: `git stash pop`
 */
export async function stashPop(projectRoot: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["stash", "pop"]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
