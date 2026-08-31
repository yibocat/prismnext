import { ipcMain } from "electron";
import * as gitService from "../git/facade";
import { getRemoteSessionBroker } from "./remote";
import { disconnectedGitProbe, routeHostDomainMethod } from "../remote/domain-route";

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  return routeHostDomainMethod(method, args, {
    keys: ["projectRoot"],
    broker: getRemoteSessionBroker(),
    disconnected: disconnectedGitProbe,
  });
}

function handleGit<T>(method: string, run: (args: T) => Promise<unknown> | unknown) {
  return async (_event: unknown, args: T) => {
    const remote = await routeIfRemote(method, args);
    if (remote !== undefined) return remote;
    return run(args);
  };
}

export function registerGitHandlers(): void {
  ipcMain.handle(
    "git:warmup",
    handleGit("git:warmup", async (args: { projectRoot: string }) => {
      await gitService.queueWarmup(args.projectRoot);
      return { ok: true };
    }),
  );

  ipcMain.handle(
    "git:isRepo",
    handleGit("git:isRepo", (args: { projectRoot: string }) => gitService.isGitRepo(args.projectRoot)),
  );

  ipcMain.handle(
    "git:status",
    handleGit("git:status", (args: { projectRoot: string }) => gitService.getStatus(args.projectRoot)),
  );

  ipcMain.handle(
    "git:branches",
    handleGit("git:branches", (args: { projectRoot: string }) => gitService.getBranches(args.projectRoot)),
  );

  ipcMain.handle(
    "git:checkout",
    handleGit("git:checkout", (args: { projectRoot: string; branch: string }) =>
      gitService.checkoutBranch(args.projectRoot, args.branch),
    ),
  );

  ipcMain.handle(
    "git:createBranch",
    handleGit("git:createBranch", (args: { projectRoot: string; branchName: string }) =>
      gitService.createBranch(args.projectRoot, args.branchName),
    ),
  );

  ipcMain.handle(
    "git:diff",
    handleGit(
      "git:diff",
      (args: {
        projectRoot: string;
        filePath: string;
        indexStatus: string;
        worktreeStatus: string;
        staged: boolean;
        unstaged: boolean;
        untracked: boolean;
        view?: "staged" | "unstaged" | "all";
      }) =>
        gitService.getFileDiff(
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
        ),
    ),
  );

  ipcMain.handle(
    "git:stage",
    handleGit("git:stage", (args: { projectRoot: string; filePath: string }) =>
      gitService.stageFile(args.projectRoot, args.filePath),
    ),
  );

  ipcMain.handle(
    "git:unstage",
    handleGit("git:unstage", (args: { projectRoot: string; filePath: string }) =>
      gitService.unstageFile(args.projectRoot, args.filePath),
    ),
  );

  ipcMain.handle(
    "git:stageAll",
    handleGit("git:stageAll", (args: { projectRoot: string; filePaths: string[] }) =>
      gitService.stageFiles(args.projectRoot, args.filePaths),
    ),
  );

  ipcMain.handle(
    "git:unstageAll",
    handleGit("git:unstageAll", (args: { projectRoot: string; filePaths: string[] }) =>
      gitService.unstageFiles(args.projectRoot, args.filePaths),
    ),
  );

  ipcMain.handle(
    "git:init",
    handleGit("git:init", (args: { projectRoot: string }) => gitService.initRepo(args.projectRoot)),
  );

  ipcMain.handle(
    "git:diffStats",
    handleGit("git:diffStats", (args: { projectRoot: string }) => gitService.getDiffStats(args.projectRoot)),
  );

  ipcMain.handle(
    "git:log",
    handleGit(
      "git:log",
      (args: {
        projectRoot: string;
        maxCount?: number;
        range?: "head" | "branch";
        baseBranch?: string;
      }) =>
        gitService.getLog(args.projectRoot, {
          maxCount: args.maxCount,
          range: args.range,
          baseBranch: args.baseBranch,
        }),
    ),
  );

  ipcMain.handle(
    "git:commitDiff",
    handleGit("git:commitDiff", (args: { projectRoot: string; hash: string }) =>
      gitService.getCommitDiff(args.projectRoot, args.hash),
    ),
  );

  ipcMain.handle(
    "git:commitFiles",
    handleGit("git:commitFiles", (args: { projectRoot: string; hash: string }) =>
      gitService.getCommitFiles(args.projectRoot, args.hash),
    ),
  );

  ipcMain.handle(
    "git:commitFileDiff",
    handleGit("git:commitFileDiff", (args: { projectRoot: string; hash: string; filePath: string }) =>
      gitService.getCommitFileDiff(args.projectRoot, args.hash, args.filePath),
    ),
  );

  ipcMain.handle(
    "git:discard",
    handleGit(
      "git:discard",
      (args: {
        projectRoot: string;
        filePath: string;
        staged: boolean;
        untracked: boolean;
        worktreeStatus: string;
      }) =>
        gitService.discardChanges(
          args.projectRoot,
          args.filePath,
          args.staged,
          args.untracked,
          args.worktreeStatus,
        ),
    ),
  );

  ipcMain.handle(
    "git:revert",
    handleGit("git:revert", (args: { projectRoot: string; hash: string }) =>
      gitService.revertCommit(args.projectRoot, args.hash),
    ),
  );

  ipcMain.handle(
    "git:reset",
    handleGit("git:reset", (args: { projectRoot: string; hash: string; mode: "soft" | "mixed" | "hard" }) =>
      gitService.resetToCommit(args.projectRoot, args.hash, args.mode),
    ),
  );

  ipcMain.handle(
    "git:merge",
    handleGit("git:merge", (args: { projectRoot: string; sourceBranch: string }) =>
      gitService.mergeBranch(args.projectRoot, args.sourceBranch),
    ),
  );

  ipcMain.handle(
    "git:mergeNoCommit",
    handleGit("git:mergeNoCommit", (args: { projectRoot: string; sourceBranch: string }) =>
      gitService.mergeNoCommit(args.projectRoot, args.sourceBranch),
    ),
  );

  ipcMain.handle(
    "git:abortMerge",
    handleGit("git:abortMerge", (args: { projectRoot: string }) => gitService.abortMerge(args.projectRoot)),
  );

  ipcMain.handle(
    "git:stash",
    handleGit("git:stash", (args: { projectRoot: string; message?: string }) =>
      gitService.stashPush(args.projectRoot, args.message),
    ),
  );

  ipcMain.handle(
    "git:stashPop",
    handleGit("git:stashPop", (args: { projectRoot: string }) => gitService.stashPop(args.projectRoot)),
  );

  ipcMain.handle(
    "git:commit",
    handleGit("git:commit", (args: { projectRoot: string; message: string }) =>
      gitService.commit(args.projectRoot, args.message),
    ),
  );

  ipcMain.handle(
    "git:commitAll",
    handleGit("git:commitAll", (args: { projectRoot: string; filePaths: string[]; message: string }) =>
      gitService.commitAll(args.projectRoot, args.filePaths, args.message),
    ),
  );

  ipcMain.handle(
    "git:deleteBranch",
    handleGit("git:deleteBranch", (args: { projectRoot: string; branch: string }) =>
      gitService.deleteBranch(args.projectRoot, args.branch),
    ),
  );

  ipcMain.handle(
    "git:push",
    handleGit("git:push", (args: { projectRoot: string; remote?: string }) =>
      gitService.pushBranch(args.projectRoot, { remote: args.remote }),
    ),
  );

  ipcMain.handle(
    "git:remotes",
    handleGit("git:remotes", (args: { projectRoot: string }) => gitService.listRemotes(args.projectRoot)),
  );

  ipcMain.handle(
    "git:addRemote",
    handleGit("git:addRemote", (args: { projectRoot: string; name: string; url: string }) =>
      gitService.addRemote(args.projectRoot, { name: args.name, url: args.url }),
    ),
  );

  ipcMain.handle(
    "git:fetch",
    handleGit("git:fetch", (args: { projectRoot: string; remote?: string; all?: boolean }) =>
      gitService.fetchRemote(args.projectRoot, { remote: args.remote, all: args.all }),
    ),
  );

  ipcMain.handle(
    "git:pull",
    handleGit("git:pull", (args: { projectRoot: string }) => gitService.pullRemote(args.projectRoot)),
  );

  ipcMain.handle(
    "git:checkIgnore",
    handleGit("git:checkIgnore", (args: { projectRoot: string; relativePaths: string[] }) =>
      gitService.checkIgnoredPaths(args.projectRoot, args.relativePaths),
    ),
  );
}
