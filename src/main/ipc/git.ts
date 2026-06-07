import { ipcMain } from "electron";
import * as gitService from "../services/git";

export function registerGitHandlers(): void {
  // ── git:isRepo ──
  ipcMain.handle(
    "git:isRepo",
    async (_event, args: { projectRoot: string }) => {
      return gitService.isGitRepo(args.projectRoot);
    },
  );

  // ── git:status ──
  ipcMain.handle(
    "git:status",
    async (_event, args: { projectRoot: string }) => {
      return gitService.getStatus(args.projectRoot);
    },
  );

  // ── git:branches ──
  ipcMain.handle(
    "git:branches",
    async (_event, args: { projectRoot: string }) => {
      return gitService.getBranches(args.projectRoot);
    },
  );

  // ── git:checkout ──
  ipcMain.handle(
    "git:checkout",
    async (_event, args: { projectRoot: string; branch: string }) => {
      return gitService.checkoutBranch(args.projectRoot, args.branch);
    },
  );

  // ── git:createBranch ──
  ipcMain.handle(
    "git:createBranch",
    async (_event, args: { projectRoot: string; branchName: string }) => {
      return gitService.createBranch(args.projectRoot, args.branchName);
    },
  );

  // ── git:diff ──
  ipcMain.handle(
    "git:diff",
    async (
      _event,
      args: {
        projectRoot: string;
        filePath: string;
        indexStatus: string;
        worktreeStatus: string;
        staged: boolean;
        unstaged: boolean;
        untracked: boolean;
        view?: "staged" | "unstaged" | "all";
      },
    ) => {
      return gitService.getFileDiff(
        args.projectRoot,
        args.filePath,
        {
          indexStatus: args.indexStatus,
          worktreeStatus: args.worktreeStatus,
          staged: args.staged,
          unstaged: args.unstaged,
          untracked: args.untracked,
        },
        args.view,
      );
    },
  );

  // ── git:stage ──
  ipcMain.handle(
    "git:stage",
    async (_event, args: { projectRoot: string; filePath: string }) => {
      return gitService.stageFile(args.projectRoot, args.filePath);
    },
  );

  // ── git:unstage ──
  ipcMain.handle(
    "git:unstage",
    async (_event, args: { projectRoot: string; filePath: string }) => {
      return gitService.unstageFile(args.projectRoot, args.filePath);
    },
  );

  // ── git:init ──
  ipcMain.handle(
    "git:init",
    async (_event, args: { projectRoot: string }) => {
      return gitService.initRepo(args.projectRoot);
    },
  );

  // ── git:diffStats ──
  ipcMain.handle(
    "git:diffStats",
    async (_event, args: { projectRoot: string }) => {
      return gitService.getDiffStats(args.projectRoot);
    },
  );

  // ── git:log ──
  ipcMain.handle(
    "git:log",
    async (_event, args: { projectRoot: string; maxCount?: number }) => {
      return gitService.getLog(args.projectRoot, args.maxCount);
    },
  );

  // ── git:commitDiff ──
  ipcMain.handle(
    "git:commitDiff",
    async (_event, args: { projectRoot: string; hash: string }) => {
      return gitService.getCommitDiff(args.projectRoot, args.hash);
    },
  );

  // ── git:commitFileDiff ──
  ipcMain.handle(
    "git:commitFileDiff",
    async (_event, args: { projectRoot: string; hash: string; filePath: string }) => {
      return gitService.getCommitFileDiff(args.projectRoot, args.hash, args.filePath);
    },
  );

  // ── git:discard ──
  ipcMain.handle(
    "git:discard",
    async (
      _event,
      args: {
        projectRoot: string;
        filePath: string;
        staged: boolean;
        untracked: boolean;
        worktreeStatus: string;
      },
    ) => {
      return gitService.discardChanges(
        args.projectRoot,
        args.filePath,
        args.staged,
        args.untracked,
        args.worktreeStatus,
      );
    },
  );

  // ── git:revert ──
  ipcMain.handle(
    "git:revert",
    async (_event, args: { projectRoot: string; hash: string }) => {
      return gitService.revertCommit(args.projectRoot, args.hash);
    },
  );

  // ── git:reset ──
  ipcMain.handle(
    "git:reset",
    async (_event, args: { projectRoot: string; hash: string; mode: "soft" | "mixed" | "hard" }) => {
      return gitService.resetToCommit(args.projectRoot, args.hash, args.mode);
    },
  );

  // ── git:merge ──
  ipcMain.handle(
    "git:merge",
    async (_event, args: { projectRoot: string; sourceBranch: string }) => {
      return gitService.mergeBranch(args.projectRoot, args.sourceBranch);
    },
  );

  // ── git:mergeNoCommit ──
  ipcMain.handle(
    "git:mergeNoCommit",
    async (_event, args: { projectRoot: string; sourceBranch: string }) => {
      return gitService.mergeNoCommit(args.projectRoot, args.sourceBranch);
    },
  );

  // ── git:abortMerge ──
  ipcMain.handle(
    "git:abortMerge",
    async (_event, args: { projectRoot: string }) => {
      return gitService.abortMerge(args.projectRoot);
    },
  );

  // ── git:stash ──
  ipcMain.handle(
    "git:stash",
    async (_event, args: { projectRoot: string; message?: string }) => {
      return gitService.stashPush(args.projectRoot, args.message);
    },
  );

  // ── git:stashPop ──
  ipcMain.handle(
    "git:stashPop",
    async (_event, args: { projectRoot: string }) => {
      return gitService.stashPop(args.projectRoot);
    },
  );

  // ── git:commit (MVP: wired, UI disabled) ──
  ipcMain.handle(
    "git:commit",
    async (_event, args: { projectRoot: string; message: string }) => {
      return gitService.commit(args.projectRoot, args.message);
    },
  );

  // ── git:commitAll ──
  ipcMain.handle(
    "git:commitAll",
    async (_event, args: { projectRoot: string; filePaths: string[]; message: string }) => {
      return gitService.commitAll(args.projectRoot, args.filePaths, args.message);
    },
  );

  // ── git:deleteBranch ──
  ipcMain.handle("git:deleteBranch", async (_e, args: {
    projectRoot: string; branch: string;
  }) => gitService.deleteBranch(args.projectRoot, args.branch));
}
