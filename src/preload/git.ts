import { ipcRenderer } from "electron";
import type { GitStatusData } from "../shared/git";

export const gitApi = {
	// Git operations
	gitWarmup: (projectRoot: string) =>
		ipcRenderer.invoke("git:warmup", { projectRoot }),
	gitIsRepo: (projectRoot: string) =>
		ipcRenderer.invoke("git:isRepo", { projectRoot }),
	gitStatus: (projectRoot: string): Promise<GitStatusData> =>
		ipcRenderer.invoke("git:status", { projectRoot }),
	gitBranches: (projectRoot: string) =>
		ipcRenderer.invoke("git:branches", { projectRoot }),
	gitCheckout: (projectRoot: string, branch: string) =>
		ipcRenderer.invoke("git:checkout", { projectRoot, branch }),
	gitCreateBranch: (projectRoot: string, branchName: string) =>
		ipcRenderer.invoke("git:createBranch", { projectRoot, branchName }),
	gitDiff: (projectRoot: string, filePath: string, indexStatus: string, worktreeStatus: string, staged: boolean, unstaged: boolean, untracked: boolean, view?: "staged" | "unstaged" | "all") =>
		ipcRenderer.invoke("git:diff", { projectRoot, filePath, indexStatus, worktreeStatus, staged, unstaged, untracked, view }),
	gitStage: (projectRoot: string, filePath: string) =>
		ipcRenderer.invoke("git:stage", { projectRoot, filePath }),
	gitUnstage: (projectRoot: string, filePath: string) =>
		ipcRenderer.invoke("git:unstage", { projectRoot, filePath }),
	gitStageAll: (projectRoot: string, filePaths: string[]) =>
		ipcRenderer.invoke("git:stageAll", { projectRoot, filePaths }),
	gitUnstageAll: (projectRoot: string, filePaths: string[]) =>
		ipcRenderer.invoke("git:unstageAll", { projectRoot, filePaths }),
	gitInit: (projectRoot: string) =>
		ipcRenderer.invoke("git:init", { projectRoot }),
	gitDiscard: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) =>
		ipcRenderer.invoke("git:discard", { projectRoot, filePath, staged, untracked, worktreeStatus }),
	gitCommit: (projectRoot: string, message: string) =>
		ipcRenderer.invoke("git:commit", { projectRoot, message }),
	gitCommitAll: (projectRoot: string, filePaths: string[], message: string) =>
		ipcRenderer.invoke("git:commitAll", { projectRoot, filePaths, message }),
	gitDeleteBranch:(projectRoot: string, branch: string) =>
		ipcRenderer.invoke("git:deleteBranch", { projectRoot, branch }),
	gitRevert: (projectRoot: string, hash: string) =>
		ipcRenderer.invoke("git:revert", { projectRoot, hash }),
	gitReset: (projectRoot: string, hash: string, mode: "soft" | "mixed" | "hard") =>
		ipcRenderer.invoke("git:reset", { projectRoot, hash, mode }),
	gitDiffStats: (projectRoot: string) =>
		ipcRenderer.invoke("git:diffStats", { projectRoot }),
	gitLog: (projectRoot: string, maxCount?: number) =>
		ipcRenderer.invoke("git:log", { projectRoot, maxCount }),
	gitPush: (projectRoot: string, remote?: string) =>
		ipcRenderer.invoke("git:push", { projectRoot, remote }),
	gitRemotes: (projectRoot: string) =>
		ipcRenderer.invoke("git:remotes", { projectRoot }),
	gitAddRemote: (projectRoot: string, name: string, url: string) =>
		ipcRenderer.invoke("git:addRemote", { projectRoot, name, url }),
	gitFetch: (projectRoot: string, opts?: { remote?: string; all?: boolean }) =>
		ipcRenderer.invoke("git:fetch", { projectRoot, remote: opts?.remote, all: opts?.all }),
	gitPull: (projectRoot: string) =>
		ipcRenderer.invoke("git:pull", { projectRoot }),
	gitMerge: (projectRoot: string, sourceBranch: string) =>
		ipcRenderer.invoke("git:merge", { projectRoot, sourceBranch }),
	gitMergeNoCommit: (projectRoot: string, sourceBranch: string) =>
		ipcRenderer.invoke("git:mergeNoCommit", { projectRoot, sourceBranch }),
	gitAbortMerge: (projectRoot: string) =>
		ipcRenderer.invoke("git:abortMerge", { projectRoot }),
	gitStash: (projectRoot: string, message?: string) =>
		ipcRenderer.invoke("git:stash", { projectRoot, message }),
	gitStashPop: (projectRoot: string) =>
		ipcRenderer.invoke("git:stashPop", { projectRoot }),
	gitCommitDiff: (projectRoot: string, hash: string) =>
		ipcRenderer.invoke("git:commitDiff", { projectRoot, hash }),
	gitCommitFiles: (projectRoot: string, hash: string) =>
		ipcRenderer.invoke("git:commitFiles", { projectRoot, hash }),
	gitCommitFileDiff: (projectRoot: string, hash: string, filePath: string) =>
		ipcRenderer.invoke("git:commitFileDiff", { projectRoot, hash, filePath }),
	gitCheckIgnore: (projectRoot: string, relativePaths: string[]) =>
		ipcRenderer.invoke("git:checkIgnore", { projectRoot, relativePaths }),
};
