import { ipcMain } from "electron";
import * as worktreeService from "../git/worktree";
import { encodeRemoteAbs, parseRemoteAbs } from "../../shared/remote";
import type { WorktreeInfo } from "../../shared/git";
import { getRemoteSessionBroker } from "./remote";
import { routeHostDomainMethod } from "../remote/domain-route";

function isWorktreeInfo(value: unknown): value is WorktreeInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.name === "string" && typeof rec.path === "string";
}

function encodeWorktreeInfo(profileId: string, info: WorktreeInfo): WorktreeInfo {
  return {
    ...info,
    path: encodeRemoteAbs(profileId, info.path) ?? info.path,
  };
}

export function encodeWorktreeResult(projectRoot: string, result: unknown): unknown {
  const parsed = parseRemoteAbs(projectRoot);
  if (!parsed) return result;
  if (Array.isArray(result) && result.every(isWorktreeInfo)) {
    return result.map((item) => encodeWorktreeInfo(parsed.profileId, item));
  }
  if (isWorktreeInfo(result)) {
    return encodeWorktreeInfo(parsed.profileId, result);
  }
  return result;
}

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  const rec = args && typeof args === "object" && !Array.isArray(args)
    ? args as { projectRoot?: string }
    : {};
  const routed = await routeHostDomainMethod(method, args, {
    keys: ["projectRoot"],
    broker: getRemoteSessionBroker(),
    disconnected(name) {
      if (name === "worktree:list") return { hit: true, result: [] };
      if (name === "worktree:branches") return { hit: true, result: [] };
      if (name === "worktree:moveSessions") return { hit: true, result: 0 };
      return { hit: false };
    },
  });
  if (routed === undefined) return undefined;
  return encodeWorktreeResult(typeof rec.projectRoot === "string" ? rec.projectRoot : "", routed);
}

export function registerWorktreeHandlers(): void {
  ipcMain.handle("worktree:list", async (_e, args: { projectRoot: string }) => {
    const remote = await routeIfRemote("worktree:list", args);
    if (remote !== undefined) return remote;
    return worktreeService.listWorktrees(args.projectRoot);
  });

  ipcMain.handle(
    "worktree:create",
    async (_e, args: { projectRoot: string; name?: string; baseBranch?: string }) => {
      const remote = await routeIfRemote("worktree:create", args);
      if (remote !== undefined) return remote;
      return worktreeService.createWorktree(args.projectRoot, args.name, args.baseBranch);
    },
  );

  ipcMain.handle("worktree:remove", async (_e, args: { projectRoot: string; name: string }) => {
    const remote = await routeIfRemote("worktree:remove", args);
    if (remote !== undefined) return remote;
    return worktreeService.removeWorktree(args.projectRoot, args.name);
  });

  ipcMain.handle("worktree:mergeStatus", async (_e, args: { projectRoot: string; name: string }) => {
    const remote = await routeIfRemote("worktree:mergeStatus", args);
    if (remote !== undefined) return remote;
    return worktreeService.getMergeStatus(args.projectRoot, args.name);
  });

  ipcMain.handle("worktree:branches", async (_e, args: { projectRoot: string }) => {
    const remote = await routeIfRemote("worktree:branches", args);
    if (remote !== undefined) return remote;
    return worktreeService.getBranchesWithLocks(args.projectRoot);
  });

  ipcMain.handle(
    "worktree:moveSessions",
    async (_e, args: { projectRoot: string; worktreeName: string }) => {
      const remote = await routeIfRemote("worktree:moveSessions", args);
      if (remote !== undefined) return remote;
      return worktreeService.moveSessionsToProject(args.projectRoot, args.worktreeName);
    },
  );
}
