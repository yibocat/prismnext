import { ipcRenderer } from "electron";
import type { BranchInfo, MergeStatus, WorktreeInfo } from "../shared/git";

export const worktreeApi = {
	// Worktree operations
	worktreeList: (projectRoot: string): Promise<WorktreeInfo[]> =>
		ipcRenderer.invoke("worktree:list", { projectRoot }),
	worktreeCreate: (projectRoot: string, name?: string, baseBranch?: string) =>
		ipcRenderer.invoke("worktree:create", { projectRoot, name, baseBranch }),
	worktreeBranches: (projectRoot: string): Promise<BranchInfo[]> =>
		ipcRenderer.invoke("worktree:branches", { projectRoot }),
	worktreeRemove: (projectRoot: string, name: string) =>
		ipcRenderer.invoke("worktree:remove", { projectRoot, name }),
	worktreeMergeStatus: (projectRoot: string, name: string): Promise<MergeStatus> =>
		ipcRenderer.invoke("worktree:mergeStatus", { projectRoot, name }),
	worktreeMoveSessions: (projectRoot: string, worktreeName: string) =>
		ipcRenderer.invoke("worktree:moveSessions", { projectRoot, worktreeName }),
};
