import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink, readdir, writeFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { createLogger, shortLogDetail } from "./logger";

const log = createLogger("git", "git");

// ─── Shell helper with concurrency limiter ───
// macOS throttles the first burst of concurrent child_process spawns.
// We queue them sequentially to avoid 20 simultaneous shell+git forks
// hitting the kernel's posix_spawn bottleneck on cold start.

let _pending: Promise<unknown> = Promise.resolve();
const _warmedUpRoots = new Set<string>();

/** Queue a warmup as the next task in the serial queue and return a
 *  promise that resolves when it completes. Callers may fire-and-forget —
 *  subsequent git operations auto-queue behind it via the serial _pending chain.
 *
 *  Idempotent per project root: repeated calls for the same root return
 *  immediately (the TCC / security check is per-process, not per directory). */
export function queueWarmup(projectRoot: string): Promise<void> {
  if (_warmedUpRoots.has(projectRoot)) return Promise.resolve();

  const start = performance.now();
  // touch+rm warms the read/write TCC path for new files.
  // Git-specific warmup runs ONLY when a repo exists — appending to .gitignore
  // on a non-git project would leave a stray root .gitignore behind.
  const hasGit = existsSync(join(projectRoot, ".git"));
  const cmdParts = [
    `cd ${JSON.stringify(projectRoot)}`,
    `touch .prism_warmup && rm .prism_warmup`,
  ];
  if (hasGit) {
    const gitignorePath = join(projectRoot, ".gitignore");
    if (existsSync(gitignorePath)) {
      cmdParts.push(`echo "warmup" >> .gitignore && git checkout -- .gitignore`);
    }
    cmdParts.push(
      `git status --porcelain -b >/dev/null`,
      `git branch --list >/dev/null`,
      `git log --oneline -1 >/dev/null`,
      `git update-index --refresh`,
    );
  }
  const cmd = cmdParts.join(" && ");

  const task = _pending.then(() => new Promise<void>((resolve) => {
    // Use spawn with explicit stdio to avoid EBADF in Electron
    const child = spawn("sh", ["-c", cmd], {
      stdio: "ignore",
      timeout: 30000,
    });
    child.on("close", () => {
      const ms = performance.now() - start;
      // warmup timing logged via log.info below
      log.debug("warmup complete", { durationMs: Math.round(ms) });
      _warmedUpRoots.add(projectRoot);
      resolve();
    });
    child.on("error", () => {
      // Warmup failure is non-fatal — resolve anyway
      _warmedUpRoots.add(projectRoot);
      resolve();
    });
  }));
  _pending = task.catch(() => {}).then(() => {});
  return task;
}

function sh(projectRoot: string, gitArgs: string[]): Promise<string> {
  const run = () => new Promise<string>((resolve, reject) => {
    const start = performance.now();
    // Use spawn with explicit stdio to avoid EBADF in Electron.
    // exec() creates a stdin pipe even when unused, which fails in GUI
    // environments where stdin may not be a valid file descriptor.
    const child = spawn("git", ["-c", "core.quotepath=false", ...gitArgs], {
      cwd: projectRoot,
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    child.on("close", (code) => {
      const ms = performance.now() - start;
      log.debug(`git ${gitArgs[0]}`, { durationMs: Math.round(ms) });
      if (code !== 0) {
        if (shouldLogGitFail(gitArgs)) {
          log.warn("git.fail", {
            cmd: gitFailCommand(gitArgs),
            exit: code ?? 1,
            stderr: shortLogDetail(stderr.trim() || `git exited with code ${code}`, 300),
            project: basename(projectRoot),
          });
        }
        reject(new Error(stderr.trim() || `git exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
    child.on("error", (err) => {
      if (shouldLogGitFail(gitArgs)) {
        log.warn("git.fail", {
          cmd: gitFailCommand(gitArgs),
          error: shortLogDetail(err),
          project: basename(projectRoot),
        });
      }
      reject(err);
    });
  });
  // Chain onto the queue so only one shell+git runs at a time.
  // This avoids macOS throttling when 20 concurrent processes are spawned.
  const task = _pending.then(run, run);
  _pending = task.catch(() => {}).then(() => {});
  return task;
}

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

/** User-facing verbs — probe commands (rev-parse, status, show) stay quiet. */
const GIT_FAIL_LOG_VERBS = new Set([
  "commit",
  "push",
  "pull",
  "fetch",
  "merge",
  "rebase",
  "add",
  "checkout",
  "switch",
  "reset",
  "stash",
  "init",
  "clone",
  "cherry-pick",
  "revert",
]);

export function gitFailCommand(gitArgs: string[]): string {
  if (gitArgs[0] === "worktree" && gitArgs[1]) return `worktree ${gitArgs[1]}`;
  return gitArgs[0] || "git";
}

export function shouldLogGitFail(gitArgs: string[]): boolean {
  const verb = gitArgs[0];
  if (verb === "worktree") return gitArgs[1] === "add" || gitArgs[1] === "remove";
  return GIT_FAIL_LOG_VERBS.has(verb ?? "");
}

const BINARY_EXTS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".ttf", ".otf", ".woff", ".woff2", ".zip", ".gz", ".tar", ".mp4",
  ".mov", ".avi", ".mp3", ".wav", ".ogg", ".7z", ".rar", ".xz",
]);

// ─── Core: execute git commands ───

export function execGit(projectRoot: string, args: string[]): Promise<string> {
  return sh(projectRoot, args);
}

export function execGitOrNull(projectRoot: string, args: string[]): Promise<string | null> {
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
  // Single spawn: `git status --porcelain -b` returns branch info on line 1
  // (## branch-name) followed by file entries — avoids a second git process.
  const output = await execGit(projectRoot, ["status", "--porcelain", "-b"]);

  const lines = output.split("\n").filter((l) => l.length > 0);

  // Parse branch from line 1: "## branch-name" or "## branch-name...origin/branch [ahead N]"
  let branch = "unknown";
  if (lines.length > 0 && lines[0].startsWith("## ")) {
    const head = lines[0].slice(3).split("...")[0].split(" ")[0].trim();
    branch = head || "(no branch)";
  }

  // Parse file entries (skip branch line)
  const files: GitFileEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
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

    // Untracked directory: expand to individual files inside.
    // Use stat() to check if an entry is a file — do NOT use readFile()
    // which reads the entire file content just to check the type.
    if (path.endsWith("/") && x === "?" && y === "?") {
      try {
        const dirPath = join(projectRoot, path);
        const entries = await readdir(dirPath, { recursive: true });
        for (const entry of entries) {
          const fullPath = path + entry;
          try {
            const s = await stat(join(projectRoot, fullPath));
            if (s.isFile()) {
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
    log.warn("git.fail", {
      op: "getFileDiff",
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    });
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

  // Three independent git commands — run them in parallel, not sequentially.
  const [unstagedOut, stagedOut, untrackedOut] = await Promise.allSettled([
    execGit(projectRoot, ["diff", "--numstat"]),
    execGit(projectRoot, ["diff", "--cached", "--numstat"]),
    execGit(projectRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);

  if (unstagedOut.status === "fulfilled") parseNumstat(unstagedOut.value, unstaged);
  if (stagedOut.status === "fulfilled") parseNumstat(stagedOut.value, staged);

  // Untracked files — list but skip reading file contents.
  if (untrackedOut.status === "fulfilled") {
    for (const file of untrackedOut.value.split("\n")) {
      if (file.trim()) unstaged[file] = { added: 0, deleted: 0 };
    }
  }

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
    // Use %x1E (Record Separator) to delimit commits so multi-line messages (%B) parse correctly.
    const output = await execGit(projectRoot, [
      "log",
      `--max-count=${maxCount}`,
      "--format=%H%x00%B%x00%an%x00%ai%x00%D%x1E",
    ]);

    const commits: GitCommit[] = [];

    for (const record of output.split("\x1E")) {
      const parts = record.trim().split("\0");
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0].slice(0, 7),
          message: parts[1].trim(),
          author: parts[2],
          date: parts[3],
          graph: "",
          refs: parts[4],
          insertions: 0,
          deletions: 0,
        });
      }
    }

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
 * Get changed files for a commit (lightweight — no diff content).
 * Uses `diff-tree --numstat` which returns just file paths + line counts.
 * For the actual diff of a specific file, use `getCommitFileDiff`.
 */
export interface CommitFileStat {
  path: string;
  added: number;
  deleted: number;
}

export async function getCommitFiles(
  projectRoot: string,
  hash: string,
): Promise<CommitFileStat[]> {
  const output = await execGit(projectRoot, [
    "diff-tree", "--no-commit-id", "--numstat", "-r", hash,
  ]);
  const files: CommitFileStat[] = [];
  for (const line of output.split("\n")) {
    const parts = line.split("\t");
    if (parts.length >= 3) {
      files.push({
        added: parseInt(parts[0], 10) || 0,
        deleted: parseInt(parts[1], 10) || 0,
        path: parts[2],
      });
    }
  }
  return files;
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
  // Check for physical .git directory at the given path.
  // Do NOT use `git rev-parse --git-dir` because it walks up the
  // directory tree.
  return existsSync(join(projectRoot, ".git"));
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
  ".workbench/interactions/",
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
 * Push current branch to its upstream, or set upstream via `origin` on first push.
 */
export async function pushBranch(
  projectRoot: string,
): Promise<GitResult & { output?: string }> {
  try {
    const branch = (await execGit(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (!branch || branch === "HEAD") {
      return { success: false, error: "Detached HEAD — cannot push" };
    }
    const upstream = await execGitOrNull(projectRoot, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
    const output = upstream
      ? await execGit(projectRoot, ["push"])
      : await execGit(projectRoot, ["push", "-u", "origin", branch]);
    return { success: true, output: output.trim() || "Pushed successfully." };
  } catch (err: unknown) {
    const msg = (err as Error).message || "Push failed";
    return { success: false, error: msg, output: msg };
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

/** Paths ignored by .gitignore (via `git check-ignore`). Fails open on error. */
export async function checkIgnoredPaths(
  projectRoot: string,
  relativePaths: string[],
): Promise<string[]> {
  if (!relativePaths.length) return [];
  if (!existsSync(join(projectRoot, ".git"))) return [];

  const CHUNK = 400;
  const ignored: string[] = [];

  const runChunk = (chunk: string[]) =>
    new Promise<string[]>((resolve) => {
      const child = spawn(
        "git",
        ["-c", "core.quotepath=false", "check-ignore", "-z", "--stdin"],
        {
          cwd: projectRoot,
          timeout: GIT_TIMEOUT_MS,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let stdout = "";
      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stdin.write(chunk.join("\0") + "\0");
      child.stdin.end();
      child.on("close", (code) => {
        // Exit 1 means none of the paths are ignored.
        if (code === 0 || code === 1) {
          resolve(stdout.split("\0").filter(Boolean));
        } else {
          resolve([]);
        }
      });
      child.on("error", () => resolve([]));
    });

  for (let i = 0; i < relativePaths.length; i += CHUNK) {
    const chunk = relativePaths.slice(i, i + CHUNK);
    const task = _pending.then(() => runChunk(chunk), () => runChunk(chunk));
    _pending = task.catch(() => {}).then(() => {});
    const part = await task;
    ignored.push(...part);
  }

  return ignored;
}
