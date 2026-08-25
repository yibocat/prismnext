import {
  BRANCH_COMMITS_MAX,
  isGitRangeRev,
  normalizeGitLogOptions,
  type GitLogOptions,
} from "../../shared/git";
import { execGit } from "./exec";

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
  maxCountOrOpts: number | GitLogOptions = 50,
): Promise<GitCommit[]> {
  const opts = normalizeGitLogOptions(maxCountOrOpts);
  const maxCount = opts.maxCount
    ?? (opts.range === "branch" ? BRANCH_COMMITS_MAX : 50);
  const range = opts.range ?? "head";
  try {
    const args = ["log", `--max-count=${maxCount}`];
    if (range === "branch") {
      const base = opts.baseBranch?.trim();
      if (!base) return [];
      args.push("--first-parent", `${base}..HEAD`);
    }
    args.push("--format=%H%x00%B%x00%an%x00%ai%x00%D%x1E");

    const output = await execGit(projectRoot, args);
    const commits = parseLogRecords(output);
    if (range === "branch") {
      await attachCommitLineCounts(projectRoot, commits);
    }
    return commits;
  } catch {
    return [];
  }
}

function parseLogRecords(output: string): GitCommit[] {
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
}

async function attachCommitLineCounts(
  projectRoot: string,
  commits: GitCommit[],
): Promise<void> {
  await Promise.all(
    commits.map(async (commit) => {
      try {
        const files = await getCommitFiles(projectRoot, commit.hash);
        commit.insertions = files.reduce((sum, file) => sum + file.added, 0);
        commit.deletions = files.reduce((sum, file) => sum + file.deleted, 0);
      } catch {
        /* keep 0/0 */
      }
    }),
  );
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
  try {
    const output = isGitRangeRev(hash)
      ? await execGit(projectRoot, ["diff", "--numstat", hash])
      : await execGit(projectRoot, [
          "diff-tree", "--root", "--no-commit-id", "--numstat", "-r", hash,
        ]);
    return parseNumstat(output);
  } catch {
    return [];
  }
}

function parseNumstat(output: string): CommitFileStat[] {
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

  const oldRev = isGitRangeRev(hash)
    ? await resolveRangeOldRev(projectRoot, hash)
    : `${hash}^`;
  const newRev = isGitRangeRev(hash) ? hash.slice(hash.lastIndexOf("...") + 3) : hash;

  try {
    newContent = await execGit(projectRoot, ["show", `${newRev}:${filePath}`]);
  } catch {
    newContent = "";
  }

  try {
    oldContent = oldRev
      ? await execGit(projectRoot, ["show", `${oldRev}:${filePath}`])
      : "";
  } catch {
    oldContent = ""; // root commit, new file, or no merge-base
  }

  return { path: filePath, oldContent, newContent };
}

async function resolveRangeOldRev(
  projectRoot: string,
  range: string,
): Promise<string | null> {
  const sep = range.indexOf("...");
  if (sep < 0) return null;
  const left = range.slice(0, sep);
  const right = range.slice(sep + 3);
  try {
    const mergeBase = (await execGit(projectRoot, ["merge-base", left, right])).trim();
    return mergeBase || null;
  } catch {
    return null;
  }
}
