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
    "diff-tree", "--root", "--no-commit-id", "--numstat", "-r", hash,
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
