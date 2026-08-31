import * as worktreeService from "../main/git/worktree";
import type { HostHandlerContext } from "./context";

function rootOf(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectRoot === "string" && params.projectRoot.trim()
    ? params.projectRoot
    : ctx.remoteRoot ?? "";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const worktreeHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "worktree:list"(params, ctx) {
    return worktreeService.listWorktrees(rootOf(params, ctx));
  },
  async "worktree:create"(params, ctx) {
    return worktreeService.createWorktree(
      rootOf(params, ctx),
      typeof params.name === "string" && params.name.trim() ? params.name : undefined,
      typeof params.baseBranch === "string" && params.baseBranch.trim() ? params.baseBranch : undefined,
    );
  },
  async "worktree:remove"(params, ctx) {
    await worktreeService.removeWorktree(rootOf(params, ctx), asString(params.name));
    return { ok: true };
  },
  async "worktree:mergeStatus"(params, ctx) {
    return worktreeService.getMergeStatus(rootOf(params, ctx), asString(params.name));
  },
  async "worktree:branches"(params, ctx) {
    return worktreeService.getBranchesWithLocks(rootOf(params, ctx));
  },
  async "worktree:moveSessions"(params, ctx) {
    return worktreeService.moveSessionsToProject(rootOf(params, ctx), asString(params.worktreeName));
  },
};
