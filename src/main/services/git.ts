import { spawn } from "node:child_process";
import { readFile, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";

// ─── Types ───

export interface GitFileEntry {
  path: string;
  oldPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatusResult {
  branch: string;
  files: GitFileEntry[];
}

export interface GitBranchesResult {
  current: string;
  branches: string[];
}

export interface GitFileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitResult {
  success: boolean;
  error?: string;
}

// ─── Constants ───

const GIT_TIMEOUT_MS = 30_000;

const BINARY_EXTS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".ttf", ".otf", ".woff", ".woff2", ".zip", ".gz", ".tar", ".mp4",
  ".mov", ".avi", ".mp3", ".wav", ".ogg", ".7z", ".rar", ".xz",
]);

// ─── Core: execute git commands ───

function execGit(projectRoot: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["-c", "core.quotepath=false", ...args], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, GIT_TIMEOUT_MS);

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Git command timed out: git ${args.join(" ")}`));
      } else if (code !== 0) {
        reject(new Error(stderr.trim() || `git ${args[0]} exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn git: ${err.message}`));
    });
  });
}

function execGitOrNull(projectRoot: string, args: string[]): Promise<string | null> {
  return execGit(projectRoot, args).catch(() => null);
}

// ─── Binary detection ───

function isBinaryFilename(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTS.has(ext);
}

function isBinaryContent(content: string): boolean {
  return content.slice(0, 8192).includes("\0");
}

// ─── File reading ───

async function readFileContent(projectRoot: string, filePath: string): Promise<string> {
  const absPath = join(projectRoot, filePath);
  try {
    const content = await readFile(absPath, "utf-8");
    if (isBinaryContent(content)) return "[Binary file]";
    return content;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

// ─── Public API ───

/**
 * Parse `git status --porcelain -b` output.
 *
 * Line 1 format:
 *   ## branch-name
 *   ## branch-name...origin/branch [ahead N] [behind M]
 *   ## HEAD (no branch)   ← detached HEAD
 *
 * Subsequent lines:
 *   XY path               ← normal (X=index, Y=worktree)
 *   XY "quoted path"      ← path with spaces (uses C-quoting)
 *   R  old -> new         ← rename: R + space + old + " -> " + new (when X=R)
 * For renames: the XY line is followed by the old-path info.
 *   R  old\0new           ← NUL-separated (git status -z variant; we don't use -z)
 *   Actually with --porcelain (not -z), renames show as:
 *     R  old -> new
 *   But only when the similarity index is shown. Without -M, renames may
 *   appear as "D" (delete) + "??" (new untracked). We handle the common cases.
 */
export async function getStatus(projectRoot: string): Promise<GitStatusResult> {
  // Get branch name. `git branch --show-current` works reliably in all
  // states: normal repos, fresh init with no commits, and detached HEAD
  // (where it returns empty string). `rev-parse --abbrev-ref HEAD` fails
  // when there are no commits yet.
  let branch: string;
  try {
    branch = (await execGit(projectRoot, ["branch", "--show-current"])).trim();
    if (!branch) branch = "(no branch)"; // detached HEAD
  } catch {
    branch = "unknown";
  }

  const output = await execGit(projectRoot, ["status", "--porcelain"]);

  const lines = output.split("\n").filter((l) => l.length > 0);

  // Parse file entries (no branch line — we got it from rev-parse above)
  const files: GitFileEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 3) continue;

    const x = line[0]; // index status
    const y = line[1]; // worktree status
    const rest = line.slice(3); // path after "XY "

    // Handle rename: the XY line has "R " in index and then "old -> new" in rest
    // Or it could be "R  old\0new" with NUL. With --porcelain it's space-separated.
    if (x === "R") {
      // Format: "R  old -> new"
      const arrow = rest.indexOf(" -> ");
      if (arrow !== -1) {
        const oldPath = unquotePath(rest.slice(0, arrow));
        const newPath = unquotePath(rest.slice(arrow + 4));
        files.push({
          path: newPath,
          oldPath,
          indexStatus: "R",
          worktreeStatus: " ",
          staged: true,
          unstaged: false,
          untracked: false,
        });
      } else {
        // Fallback: just use the path as-is
        files.push({
          path: unquotePath(rest),
          oldPath: null,
          indexStatus: "R",
          worktreeStatus: " ",
          staged: true,
          unstaged: false,
          untracked: false,
        });
      }
      continue;
    }

    // For renames shown as R + score (e.g., "R100 old -> new")
    // Actually this is the same as above — the standard --porcelain format
    // already handles it. Additional rename formats shouldn't appear
    // without -M/--find-renames flags.

    const path = unquotePath(rest);

    // Empty path — skip
    if (!path) continue;

    // Untracked directory: expand to individual files inside
    if (path.endsWith("/") && x === "?" && y === "?") {
      try {
        const dirPath = join(projectRoot, path);
        const entries = await readdir(dirPath, { recursive: true });
        for (const entry of entries) {
          const fullPath = path + entry;
          try {
            // Quick check: is it a file? Skip if directory (readFile would fail)
            const stat = await readFile(join(projectRoot, fullPath), "utf-8");
            if (stat !== undefined) {
              files.push({
                path: fullPath.replace(/\\/g, "/"),
                oldPath: null,
                indexStatus: "?",
                worktreeStatus: "?",
                staged: false,
                unstaged: false,
                untracked: true,
              });
            }
          } catch {
            // Skip directories and unreadable files
          }
        }
      } catch { /* ignore — can't read directory */ }
      continue;
    }

    const untracked = x === "?" && y === "?";
    const staged = x !== " " && x !== "?" && x !== "!";
    const unstaged = y !== " " && y !== "?" && y !== "!";

    files.push({
      path,
      oldPath: null,
      indexStatus: x,
      worktreeStatus: y,
      staged,
      unstaged,
      untracked,
    });
  }

  return { branch, files };
}

/** Remove C-style quoting from git porcelain paths */
function unquotePath(p: string): string {
  if (p.startsWith('"') && p.endsWith('"')) {
    // Handle C-quoted paths: \" → ", \\ → \, \n → newline, etc.
    const inner = p.slice(1, -1);
    return inner.replace(/\\(.)/g, (_, c: string) => {
      switch (c) {
        case "n": return "\n";
        case "t": return "\t";
        case "\\": return "\\";
        case '"': return '"';
        default: return c;
      }
    });
  }
  return p;
}

/**
 * Get old and new content for a file's diff.
 *
 * The `view` parameter controls which comparison to show when a file has
 * both staged AND unstaged changes (MM in git status). For single-state
 * files it has no effect — the only meaningful diff is used regardless.
 *
 *   view = "staged"   → HEAD vs index    (what will be committed)
 *   view = "unstaged" → index vs disk    (what changed since staging)
 *   view = "all"      → HEAD vs disk     (everything uncommitted)
 *
 * Strategy per file state:
 *   - Untracked (?):       old = "" (empty),             new = read from disk
 *   - Staged only:         old = git show HEAD:<path>,   new = git show :<path>
 *   - Unstaged only:       old = git show :<path>,       new = read from disk
 *   - Both staged+unstaged (MM): depends on `view` (see above)
 *   - Deleted in worktree: new = "" (empty)
 *   - Added in index:      old = "" (empty)
 */
export async function getFileDiff(
  projectRoot: string,
  filePath: string,
  entry: Pick<GitFileEntry, "indexStatus" | "worktreeStatus" | "staged" | "unstaged" | "untracked">,
  view: "staged" | "unstaged" | "all" = "all",
): Promise<GitFileDiff> {
  // Binary files: return placeholder, skip content reading
  if (isBinaryFilename(filePath)) {
    return {
      path: filePath,
      oldContent: "[Binary file]",
      newContent: "[Binary file]",
      indexStatus: entry.indexStatus,
      worktreeStatus: entry.worktreeStatus,
      staged: entry.staged,
      unstaged: entry.unstaged,
      untracked: entry.untracked,
    };
  }

  let oldContent = "";
  let newContent = "";

  try {
    if (entry.untracked) {
      // Untracked: old = empty, new = disk
      oldContent = "";
      newContent = await readFileContent(projectRoot, filePath);
    } else if (entry.staged && !entry.unstaged) {
      // Staged only: old = HEAD, new = index
      if (entry.indexStatus === "A") {
        oldContent = "";
      } else {
        oldContent = (await execGitOrNull(projectRoot, ["show", `HEAD:${filePath}`])) ?? "";
      }
      if (entry.indexStatus === "D") {
        newContent = "";
      } else {
        newContent = (await execGitOrNull(projectRoot, ["show", `:${filePath}`])) ?? "";
      }
    } else if (entry.unstaged && !entry.staged) {
      // Unstaged only: old = index, new = disk
      if (entry.worktreeStatus === "D") {
        oldContent = (await execGitOrNull(projectRoot, ["show", `HEAD:${filePath}`])) ?? "";
        newContent = "";
      } else {
        oldContent = (await execGitOrNull(projectRoot, ["show", `:${filePath}`])) ?? "";
        newContent = await readFileContent(projectRoot, filePath);
      }
    } else {
      // Both staged and unstaged (MM): depends on view
      if (view === "staged") {
        // Show what's staged: HEAD → index
        try {
          oldContent = (await execGitOrNull(projectRoot, ["show", `HEAD:${filePath}`])) ?? "";
        } catch {
          oldContent = "";
        }
        try {
          newContent = (await execGitOrNull(projectRoot, ["show", `:${filePath}`])) ?? "";
        } catch {
          newContent = "";
        }
      } else if (view === "unstaged") {
        // Show what's changed since staging: index → disk
        try {
          oldContent = (await execGitOrNull(projectRoot, ["show", `:${filePath}`])) ?? "";
        } catch {
          oldContent = "";
        }
        if (entry.worktreeStatus === "D") {
          newContent = "";
        } else {
          newContent = await readFileContent(projectRoot, filePath);
        }
      } else {
        // "all" — show everything: HEAD → disk
        try {
          oldContent = (await execGitOrNull(projectRoot, ["show", `HEAD:${filePath}`])) ?? "";
        } catch {
          oldContent = "";
        }
        if (entry.worktreeStatus === "D") {
          newContent = "";
        } else {
          newContent = await readFileContent(projectRoot, filePath);
        }
      }
    }
  } catch (err) {
    console.error(`[git] getFileDiff failed for ${filePath}:`, err);
  }

  // Check for binary content in fetched strings
  if (oldContent && isBinaryContent(oldContent)) oldContent = "[Binary file]";
  if (newContent && isBinaryContent(newContent)) newContent = "[Binary file]";

  return {
    path: filePath,
    oldContent,
    newContent,
    indexStatus: entry.indexStatus,
    worktreeStatus: entry.worktreeStatus,
    staged: entry.staged,
    unstaged: entry.unstaged,
    untracked: entry.untracked,
  };
}

/**
 * List all local branches.
 */
export async function getBranches(projectRoot: string): Promise<GitBranchesResult> {
  const output = await execGit(projectRoot, ["branch", "--list"]);

  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  let current = "";
  const branches: string[] = [];

  for (const line of lines) {
    if (line.startsWith("* ")) {
      current = line.slice(2).trim();
      branches.push(current);
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
 * Switch to a branch. Tries `git switch` first (modern, branch-only),
 * falls back to `git checkout` for older git versions.
 */
export async function checkoutBranch(projectRoot: string, branch: string): Promise<GitResult> {
  try {
    // `git switch` is branch-only — won't misinterpret branch names as pathspecs
    await execGit(projectRoot, ["switch", branch]);
    return { success: true };
  } catch {
    // Fallback: try `git checkout` for older git (< 2.23)
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
 * Get diff stats: `git diff --numstat` for unstaged + `--cached` for staged.
 * Returns { added, deleted } per file path. Untracked files not included (0/0).
 */
export interface DiffStat {
  added: number;
  deleted: number;
}

export async function getDiffStats(
  projectRoot: string,
): Promise<{ unstaged: Record<string, DiffStat>; staged: Record<string, DiffStat> }> {
  const unstaged: Record<string, DiffStat> = {};
  const staged: Record<string, DiffStat> = {};

  try {
    const unstagedOut = await execGit(projectRoot, ["diff", "--numstat"]);
    parseNumstat(unstagedOut, unstaged);
  } catch { /* no unstaged changes or no commits */ }

  try {
    const stagedOut = await execGit(projectRoot, ["diff", "--cached", "--numstat"]);
    parseNumstat(stagedOut, staged);
  } catch { /* no staged changes or no commits */ }

  // Untracked files: count lines on disk (not covered by numstat)
  try {
    const untrackedOut = await execGit(projectRoot, [
      "ls-files", "--others", "--exclude-standard",
    ]);
    for (const file of untrackedOut.split("\n")) {
      if (!file.trim()) continue;
      try {
        const content = await readFileContent(projectRoot, file);
        if (content && content !== "[Binary file]") {
          unstaged[file] = { added: content.split("\n").length, deleted: 0 };
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* no untracked files */ }

  // Fallback: if there are no commits yet, `diff --cached` fails.
  // Count lines for newly-staged files from the index.
  try {
    await execGit(projectRoot, ["rev-parse", "HEAD"]);
  } catch {
    // No HEAD — stage stats are from empty, count index content
    try {
      const stagedList = await execGit(projectRoot, [
        "diff", "--cached", "--name-only",
      ]);
      for (const file of stagedList.split("\n")) {
        if (!file.trim() || staged[file]) continue;
        try {
          const content = await execGitOrNull(projectRoot, ["show", `:${file}`]);
          if (content) {
            staged[file] = { added: content.split("\n").length, deleted: 0 };
          }
        } catch { /* skip */ }
      }
    } catch { /* no staged files */ }
  }

  return { unstaged, staged };
}

function parseNumstat(output: string, target: Record<string, DiffStat>): void {
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length >= 3) {
      target[parts[2]] = {
        added: parseInt(parts[0], 10) || 0,
        deleted: parseInt(parts[1], 10) || 0,
      };
    }
  }
}

/**
 * Get commit history: `git log --oneline --max-count=<n>`
 */
export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  graph: string;
  refs: string;
  insertions: number;
  deletions: number;
}

export async function getLog(
  projectRoot: string,
  maxCount: number = 50,
): Promise<GitCommit[]> {
  try {
    const output = await execGit(projectRoot, [
      "log",
      "--graph",
      `--max-count=${maxCount}`,
      "--format=%H%x00%s%x00%an%x00%ai%x00%D",
      "--shortstat",
    ]);

    const commits: GitCommit[] = [];
    let current: Partial<GitCommit> | null = null;

    for (const line of output.split("\n")) {
      const graphEnd = line.search(/[0-9a-f]{40}/);
      if (graphEnd >= 0) {
        if (current) commits.push(current as GitCommit);
        const graph = graphEnd > 0 ? line.slice(0, graphEnd) : "";
        const parts = line.slice(graphEnd).split("\0");
        if (parts.length >= 5) {
          current = {
            hash: parts[0].slice(0, 7),
            message: parts[1],
            author: parts[2],
            date: parts[3],
            graph,
            refs: parts[4],
            insertions: 0,
            deletions: 0,
          };
        }
      } else if (current) {
        const ins = line.match(/(\d+)\s+insertions?\(\+\)/);
        const del = line.match(/(\d+)\s+deletions?\(\-\)/);
        if (ins) current.insertions = parseInt(ins[1], 10);
        if (del) current.deletions = parseInt(del[1], 10);
      }
    }
    if (current) commits.push(current as GitCommit);

    return commits;
  } catch {
    return [];
  }
}

/**
 * Get the diff for a specific commit: `git show <hash>`
 */
export async function getCommitDiff(
  projectRoot: string,
  hash: string,
): Promise<string> {
  return execGit(projectRoot, ["show", "--stat", "--patch", hash]);
}

export interface CommitFileDiff {
  path: string;
  oldContent: string;
  newContent: string;
}

/**
 * Get old/new content for a single file in a commit.
 * old = parent commit's version (or "" for root commit)
 * new = this commit's version
 */
export async function getCommitFileDiff(
  projectRoot: string,
  hash: string,
  filePath: string,
): Promise<CommitFileDiff> {
  let oldContent = "";
  let newContent = "";

  try {
    newContent = await execGit(projectRoot, ["show", `${hash}:${filePath}`]);
  } catch {
    newContent = "";
  }

  try {
    oldContent = await execGit(projectRoot, ["show", `${hash}^:${filePath}`]);
  } catch {
    oldContent = ""; // root commit or new file
  }

  return { path: filePath, oldContent, newContent };
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

/**
 * Check if a directory is inside a git repository.
 */
export async function isGitRepo(projectRoot: string): Promise<boolean> {
  try {
    await execGit(projectRoot, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a git repository: `git init`
 */
const DEFAULT_GITIGNORE = [
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
  "# Build & cache",
  ".prismnext/compile/",
  "*.pyc",
  "__pycache__/",
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

import { writeFile } from "node:fs/promises";

export async function initRepo(projectRoot: string): Promise<GitResult> {
  try {
    await execGit(projectRoot, ["init"]);
    // Write default .gitignore
    try {
      await writeFile(join(projectRoot, ".gitignore"), DEFAULT_GITIGNORE);
    } catch { /* non-critical */ }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

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
