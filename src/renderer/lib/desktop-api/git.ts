/**
 * Git desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by git-store. git-diff-prefs-store is not on this port yet.
 */

type DesktopApi = typeof window.electronAPI;

function forward<K extends keyof DesktopApi>(name: K): DesktopApi[K] {
  return ((...args: Parameters<DesktopApi[K]>) => {
    const fn = window.electronAPI?.[name];
    return typeof fn === "function" ? (fn as DesktopApi[K])(...args) : undefined;
  }) as DesktopApi[K];
}

export const gitDesktop = {
  gitLog: forward("gitLog"),
  gitIsRepo: forward("gitIsRepo"),
  gitStatus: forward("gitStatus"),
  gitDiffStats: forward("gitDiffStats"),
  gitBranches: forward("gitBranches"),
  gitDiff: forward("gitDiff"),
  gitStage: forward("gitStage"),
  gitUnstage: forward("gitUnstage"),
  gitStageAll: forward("gitStageAll"),
  gitUnstageAll: forward("gitUnstageAll"),
  gitDiscard: forward("gitDiscard"),
  gitCommit: forward("gitCommit"),
  gitWarmup: forward("gitWarmup"),
  gitCheckout: forward("gitCheckout"),
  gitCreateBranch: forward("gitCreateBranch"),
  gitPush: forward("gitPush"),
  gitMerge: forward("gitMerge"),
  gitAbortMerge: forward("gitAbortMerge"),
  gitRevert: forward("gitRevert"),
  gitReset: forward("gitReset"),
  gitInit: forward("gitInit"),
};
