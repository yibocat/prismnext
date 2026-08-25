import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../app/logger";
import {
  buildTracking,
  parsePorcelainHeader,
  parseRemoteNames,
} from "../../shared/git";
import type { GitFileDiff, GitFileEntry, GitStatusResult } from "./types";
import { enqueueGitTask, execGit, execGitOrNull, GIT_TIMEOUT_MS } from "./exec";

const log = createLogger("git", "git");

const BINARY_EXTS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".ttf", ".otf", ".woff", ".woff2", ".zip", ".gz", ".tar", ".mp4",
  ".mov", ".avi", ".mp3", ".wav", ".ogg", ".7z", ".rar", ".xz",
]);

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
  // Porcelain -b carries branch + ahead/behind; remotes is a cheap second spawn
  // so hasRemote / remoteName work when there is no upstream yet.
  const [output, remotesOut] = await Promise.all([
    execGit(projectRoot, ["status", "--porcelain", "-b"]),
    execGitOrNull(projectRoot, ["remote"]),
  ]);

  const lines = output.split("\n").filter((l) => l.length > 0);
  const header = parsePorcelainHeader(lines[0] ?? "");
  const remotes = parseRemoteNames(remotesOut);
  const tracking = buildTracking(header, remotes);
  const branch = header.branch || "unknown";

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

  return { branch, files, tracking };
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

/** Match git numstat: trailing newline does not add an extra line. */
function countTextLines(content: string): number {
  if (!content) return 0;
  const parts = content.split("\n");
  return parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
}

const UNTRACKED_STAT_MAX_BYTES = 1_048_576;

async function countUntrackedStat(projectRoot: string, file: string): Promise<DiffStat> {
  if (isBinaryFilename(file)) return { added: 0, deleted: 0 };
  const absPath = join(projectRoot, file);
  try {
    const info = await stat(absPath);
    if (!info.isFile() || info.size > UNTRACKED_STAT_MAX_BYTES) {
      return { added: 0, deleted: 0 };
    }
    const content = await readFile(absPath, "utf-8");
    if (isBinaryContent(content)) return { added: 0, deleted: 0 };
    return { added: countTextLines(content), deleted: 0 };
  } catch {
    return { added: 0, deleted: 0 };
  }
}

/**
 * Get diff stats: `git diff --numstat` for unstaged + `--cached` for staged.
 * Untracked text files are counted from disk (same +N a new-file numstat would show).
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

  if (untrackedOut.status === "fulfilled") {
    const untracked = untrackedOut.value
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean);
    await Promise.all(
      untracked.map(async (file) => {
        unstaged[file] = await countUntrackedStat(projectRoot, file);
      }),
    );
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
 * Check if a directory is inside a git repository.
 */
export async function isGitRepo(projectRoot: string): Promise<boolean> {
  // Check for physical .git directory at the given path.
  // Do NOT use `git rev-parse --git-dir` because it walks up the
  // directory tree.
  return existsSync(join(projectRoot, ".git"));
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
    const part = await enqueueGitTask(() => runChunk(chunk));
    ignored.push(...part);
  }

  return ignored;
}
