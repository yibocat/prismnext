import type { GitFileItem } from "@/stores/git-store";

export type GitChangeStatusTone =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

export interface GitChangeStatusBadge {
  letter: string;
  tone: GitChangeStatusTone;
}

/** Letter + color tone for Changes sidebar rows (Cursor-style). */
export function resolveGitChangeStatusBadge(file: GitFileItem): GitChangeStatusBadge {
  if (file.untracked) {
    return { letter: "U", tone: "untracked" };
  }

  const status =
    file.splitView === "staged"
      ? file.indexStatus
      : file.splitView === "unstaged"
        ? file.worktreeStatus
        : file.unstaged
          ? file.worktreeStatus
          : file.indexStatus;

  const code = status.trim() || status;

  switch (code) {
    case "A":
      return { letter: "A", tone: "added" };
    case "M":
      return { letter: "M", tone: "modified" };
    case "D":
      return { letter: "D", tone: "deleted" };
    case "R":
      return { letter: "R", tone: "renamed" };
    case "?":
    case "U":
      return { letter: "U", tone: "untracked" };
    default:
      return { letter: "M", tone: "modified" };
  }
}

/** Whether the Changes list should show the "New" label (untracked or pure add). */
export function isGitChangeNewFile(file: GitFileItem): boolean {
  if (file.untracked) return true;
  if (file.deleted > 0) return false;
  const { tone } = resolveGitChangeStatusBadge(file);
  return tone === "added";
}

export function gitChangeStatusTextClass(tone: GitChangeStatusTone): string {
  switch (tone) {
    case "added":
    case "untracked":
      return "text-emerald-600 dark:text-emerald-400";
    case "modified":
      return "text-amber-600 dark:text-amber-400";
    case "deleted":
      return "text-red-500 dark:text-red-400";
    case "renamed":
      return "text-violet-600 dark:text-violet-400";
  }
}

/** Pick one git row per path for Files tree (MM entries collapse to one badge). */
export function pickGitFileItemForPath(
  gitFiles: GitFileItem[],
  path: string,
): GitFileItem | undefined {
  const matches = gitFiles.filter((f) => f.path === path);
  if (matches.length === 0) return undefined;
  return (
    matches.find((f) => f.untracked) ??
    matches.find((f) => f.unstaged) ??
    matches.find((f) => f.staged) ??
    matches[0]
  );
}

export function resolveGitChangeBadgeForPath(
  gitFiles: GitFileItem[],
  path: string,
): GitChangeStatusBadge | undefined {
  const item = pickGitFileItemForPath(gitFiles, path);
  return item ? resolveGitChangeStatusBadge(item) : undefined;
}
