/**
 * Git desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by git-store and worktree-store. git-diff-prefs-store is not on this port yet.
 */

import { forwardDesktop } from "./forward";

export const gitDesktop = {
  gitLog: forwardDesktop("gitLog"),
  gitIsRepo: forwardDesktop("gitIsRepo"),
  gitStatus: forwardDesktop("gitStatus"),
  gitDiffStats: forwardDesktop("gitDiffStats"),
  gitBranches: forwardDesktop("gitBranches"),
  gitDiff: forwardDesktop("gitDiff"),
  gitStage: forwardDesktop("gitStage"),
  gitUnstage: forwardDesktop("gitUnstage"),
  gitStageAll: forwardDesktop("gitStageAll"),
  gitUnstageAll: forwardDesktop("gitUnstageAll"),
  gitDiscard: forwardDesktop("gitDiscard"),
  gitCommit: forwardDesktop("gitCommit"),
  gitWarmup: forwardDesktop("gitWarmup"),
  gitCheckout: forwardDesktop("gitCheckout"),
  gitCreateBranch: forwardDesktop("gitCreateBranch"),
  gitPush: forwardDesktop("gitPush"),
  gitRemotes: forwardDesktop("gitRemotes"),
  gitAddRemote: forwardDesktop("gitAddRemote"),
  gitFetch: forwardDesktop("gitFetch"),
  gitPull: forwardDesktop("gitPull"),
  gitMerge: forwardDesktop("gitMerge"),
  gitAbortMerge: forwardDesktop("gitAbortMerge"),
  gitRevert: forwardDesktop("gitRevert"),
  gitReset: forwardDesktop("gitReset"),
  gitInit: forwardDesktop("gitInit"),
  gitStash: forwardDesktop("gitStash"),
  gitStashPop: forwardDesktop("gitStashPop"),
  gitCommitAll: forwardDesktop("gitCommitAll"),
  gitMergeNoCommit: forwardDesktop("gitMergeNoCommit"),
  gitDeleteBranch: forwardDesktop("gitDeleteBranch"),
  gitCheckIgnore: forwardDesktop("gitCheckIgnore"),
  gitCommitFiles: forwardDesktop("gitCommitFiles"),
  gitCommitFileDiff: forwardDesktop("gitCommitFileDiff"),
  worktreeList: forwardDesktop("worktreeList"),
  worktreeCreate: forwardDesktop("worktreeCreate"),
  worktreeRemove: forwardDesktop("worktreeRemove"),
  worktreeMoveSessions: forwardDesktop("worktreeMoveSessions"),
  worktreeBranches: forwardDesktop("worktreeBranches"),
};
