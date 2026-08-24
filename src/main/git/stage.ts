import { unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GitResult } from "./types";
import { execGit } from "./exec";

/**
 * Stage a file: `git add -- <filePath>`
 */
export async function stageFile(projectRoot: string, filePath: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["add", "--", filePath]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Batch stage multiple files in a single git command.
 */
export async function stageFiles(projectRoot: string, filePaths: string[]): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["add", "--", ...filePaths]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Unstage a file: `git reset HEAD -- <filePath>`
 * For untracked files, this is a no-op (git status won't show them as staged anyway).
 */
export async function unstageFile(projectRoot: string, filePath: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["reset", "HEAD", "--", filePath]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Batch unstage multiple files in a single git command.
 */
export async function unstageFiles(projectRoot: string, filePaths: string[]): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["reset", "HEAD", "--", ...filePaths]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Discard changes to a file. Strategy depends on state:
 * - Staged: reset HEAD first, then restore/delete
 * - Unstaged modified: `git checkout -- <file>` (restore from index)
 * - Untracked: delete the file from disk
 * - Deleted in worktree: `git checkout -- <file>` (restore from HEAD)
 */
export async function discardChanges(
  projectRoot: string,
  filePath: string,
  staged: boolean,
  untracked: boolean,
  worktreeStatus: string,
): Promise<GitResult> {
  try {
    if (staged) {
      await execGit(projectRoot, ["reset", "HEAD", "--", filePath]);
    }
    if (untracked) {
      const absPath = join(projectRoot, filePath);
      await unlink(absPath);
    } else {
      await execGit(projectRoot, ["checkout", "--", filePath]);
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
