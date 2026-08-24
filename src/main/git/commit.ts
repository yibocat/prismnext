import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitResult } from "./types";
import { execGit } from "./exec";

/**
 * Revert a commit by hash. Creates a new commit that reverses its changes.
 * Uses --no-edit to accept the default revert message without opening an editor.
 */
export async function revertCommit(projectRoot: string, hash: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["revert", "--no-edit", hash]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Reset HEAD to a specific commit.
 * @param mode "soft" (keep staged), "mixed" (keep unstaged, default), "hard" (discard all)
 */
export async function resetToCommit(
  projectRoot: string,
  hash: string,
  mode: "soft" | "mixed" | "hard",
): Promise<GitResult> {
  try {
    const flag = mode === "soft" ? "--soft" : mode === "hard" ? "--hard" : "--mixed";
    await execGit(projectRoot, ["reset", flag, hash]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Initialize a git repository: `git init`
 */
export const DEFAULT_PROJECT_GITIGNORE = [
  "# LaTeX build artifacts",
  "*.aux",
  "*.log",
  "*.out",
  "*.toc",
  "*.bbl",
  "*.blg",
  "*.synctex.gz",
  "*.fdb_latexmk",
  "*.fls",
  "*.xdv",
  "*.nav",
  "*.snm",
  "*.vrb",
  "",
  "# Workbench build & cache — do not ignore the whole .workbench directory",
  ".workbench/compile/",
  ".workbench/.venv/",
  ".workbench/experiments/",
  ".workbench/interactions/",
  ".workbench/provenance.jsonl",
  ".workbench/backups/",
  ".workbench/cache/",
  ".workbench/state/",
  ".workbench/state.json",
  ".workbench/settings.json",
  ".venv/",
  ".prism-worktree-meta",
  "*.pyc",
  "__pycache__/",
  "",
  "# OpenCode runtime artifacts (managed by prismnext, not project source)",
  ".opencode/",
  ".agents/",
  "",
  "# System files",
  ".DS_Store",
  "Thumbs.db",
  "",
  "# Editor",
  "*.swp",
  "*.swo",
  "*~",
].join("\n") + "\n";

export async function initRepo(projectRoot: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["init"]);
    // Write default .gitignore
    try {
      await writeFile(join(projectRoot, ".gitignore"), DEFAULT_PROJECT_GITIGNORE);
    } catch { /* non-critical */ }
    // Stage everything and create initial commit
    try {
      await execGit(projectRoot, ["add", "-A"]);
      await execGit(projectRoot, ["commit", "-m", "Initial project setup"]);
    } catch {
      // Fallback: empty repo (no files yet)
      await execGit(projectRoot, ["commit", "--allow-empty", "-m", "Initial project setup"]);
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Commit staged changes: `git commit -m <message>`
 * MVP: handler exists but UI is disabled (placeholder for future).
 */
export async function commit(projectRoot: string, message: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["commit", "-m", message]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Stage specified files and commit with a message.
 * Used by worktree unified commit to stage+commit in one operation.
 *
 * Equivalent to: git add <files...> && git commit -m <message>
 *
 * @param projectRoot - The git repo root (projectRoot or worktree path)
 * @param filePaths   - Relative file paths within the repo to stage+commit
 * @param message     - Commit message
 */
export async function commitAll(
  projectRoot: string,
  filePaths: string[],
  message: string,
): Promise<GitResult> {
  if (filePaths.length === 0) {
    return { success: false, error: "No files to commit" };
  }
  try {
    // Batch all files into a single git add: `git add -- file1 file2 ...`
    await execGit(projectRoot, ["add", "--", ...filePaths]);
    await execGit(projectRoot, ["commit", "-m", message]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
