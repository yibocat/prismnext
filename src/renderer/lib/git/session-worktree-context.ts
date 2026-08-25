import type { WorktreeInfo } from "@/types/electron";
import { gitDesktop } from "@/lib/desktop-api/git";
import { isWorktreeCheckoutPath } from "./checkout-context";
import { findWorktreeForDirectory, parseWorktreeNameFromPath } from "./worktree-path";

export { parseWorktreeNameFromPath } from "./worktree-path";

export type SessionCheckoutKind = "local" | "worktree" | "closed-worktree";

export interface SessionWorktreeContext {
  kind: SessionCheckoutKind;
  directory: string;
  worktreeName?: string;
  /** Git branch checked out in this directory (worktree branch or local HEAD). */
  gitBranch?: string;
  baseBranch?: string;
  /** Full label for hover cards, e.g. "calm-owl → feature-auth" */
  label: string;
  /** Compact label for session list rows */
  shortLabel: string;
}

export function resolveSessionWorktreeContext(
  directory: string | null | undefined,
  projectRoot: string | null,
  worktrees: WorktreeInfo[],
): SessionWorktreeContext {
  const dir = directory || projectRoot || "";
  if (!projectRoot || !directory || directory === projectRoot) {
    return {
      kind: "local",
      directory: dir,
      label: "Local project",
      shortLabel: "Local",
    };
  }

  if (!isWorktreeCheckoutPath(directory, projectRoot)) {
    return {
      kind: "local",
      directory: dir,
      label: "Local project",
      shortLabel: "Local",
    };
  }

  const active = findWorktreeForDirectory(directory, worktrees, projectRoot);
  if (active) {
    const branch = active.baseBranch || "main";
    return {
      kind: "worktree",
      directory,
      worktreeName: active.name,
      gitBranch: active.branch || undefined,
      baseBranch: branch,
      label: `${active.name} → ${branch}`,
      shortLabel: `${active.name} · ${branch}`,
    };
  }

  const name = parseWorktreeNameFromPath(directory, projectRoot) ?? "worktree";
  return {
    kind: "closed-worktree",
    directory,
    worktreeName: name,
    label: `${name} (worktree closed)`,
    shortLabel: `${name} (closed)`,
  };
}

export async function readCurrentGitBranch(directory: string): Promise<string | null> {
  const root = directory.trim();
  if (!root) return null;
  try {
    const data = await gitDesktop.gitBranches(root);
    const current = data.current?.trim();
    if (!current || current === "(no branch)") return null;
    return current;
  } catch {
    return null;
  }
}
