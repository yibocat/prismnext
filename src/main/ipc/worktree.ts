import { ipcMain } from "electron";
import * as worktreeService from "../services/worktree";

export function registerWorktreeHandlers(): void {
  ipcMain.handle("worktree:list", async (_e, args: { projectRoot: string }) =>
    worktreeService.listWorktrees(args.projectRoot));

  ipcMain.handle("worktree:create", async (_e, args: { projectRoot: string; name?: string; baseBranch?: string }) =>
    worktreeService.createWorktree(args.projectRoot, args.name, args.baseBranch));

  ipcMain.handle("worktree:remove", async (_e, args: { projectRoot: string; name: string }) =>
    worktreeService.removeWorktree(args.projectRoot, args.name));

  ipcMain.handle("worktree:mergeStatus", async (_e, args: { projectRoot: string; name: string }) =>
    worktreeService.getMergeStatus(args.projectRoot, args.name));

  ipcMain.handle("worktree:branches", async (_e, args: { projectRoot: string }) =>
    worktreeService.getBranchesWithLocks(args.projectRoot));

  ipcMain.handle("worktree:moveSessions", async (_e, args: { projectRoot: string; worktreeName: string }) =>
    worktreeService.moveSessionsToProject(args.projectRoot, args.worktreeName));
}
