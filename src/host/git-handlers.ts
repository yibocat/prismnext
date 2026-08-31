import * as gitService from "../main/git/facade";
import type { HostHandlerContext } from "./context";

function rootOf(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectRoot === "string" && params.projectRoot.trim()
    ? params.projectRoot
    : ctx.remoteRoot ?? "";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export const gitHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "git:warmup"() {
    return { ok: true };
  },
  async "git:isRepo"(params, ctx) {
    return gitService.isGitRepo(rootOf(params, ctx));
  },
  async "git:status"(params, ctx) {
    return gitService.getStatus(rootOf(params, ctx));
  },
  async "git:branches"(params, ctx) {
    return gitService.getBranches(rootOf(params, ctx));
  },
  async "git:checkout"(params, ctx) {
    return gitService.checkoutBranch(rootOf(params, ctx), asString(params.branch));
  },
  async "git:createBranch"(params, ctx) {
    return gitService.createBranch(rootOf(params, ctx), asString(params.branchName));
  },
  async "git:diff"(params, ctx) {
    return gitService.getFileDiff(
      rootOf(params, ctx),
      asString(params.filePath),
      {
        indexStatus: asString(params.indexStatus),
        worktreeStatus: asString(params.worktreeStatus),
        staged: params.staged === true,
        unstaged: params.unstaged === true,
        untracked: params.untracked === true,
      },
      params.view === "staged" || params.view === "unstaged" || params.view === "all"
        ? params.view
        : "all",
    );
  },
  async "git:stage"(params, ctx) {
    return gitService.stageFile(rootOf(params, ctx), asString(params.filePath));
  },
  async "git:unstage"(params, ctx) {
    return gitService.unstageFile(rootOf(params, ctx), asString(params.filePath));
  },
  async "git:stageAll"(params, ctx) {
    return gitService.stageFiles(rootOf(params, ctx), asStringList(params.filePaths));
  },
  async "git:unstageAll"(params, ctx) {
    return gitService.unstageFiles(rootOf(params, ctx), asStringList(params.filePaths));
  },
  async "git:init"(params, ctx) {
    return gitService.initRepo(rootOf(params, ctx));
  },
  async "git:diffStats"(params, ctx) {
    return gitService.getDiffStats(rootOf(params, ctx));
  },
  async "git:log"(params, ctx) {
    return gitService.getLog(rootOf(params, ctx), {
      maxCount: typeof params.maxCount === "number" ? params.maxCount : undefined,
      range: params.range === "branch" || params.range === "head" ? params.range : undefined,
      baseBranch: typeof params.baseBranch === "string" ? params.baseBranch : undefined,
    });
  },
  async "git:commitDiff"(params, ctx) {
    return gitService.getCommitDiff(rootOf(params, ctx), asString(params.hash));
  },
  async "git:commitFiles"(params, ctx) {
    return gitService.getCommitFiles(rootOf(params, ctx), asString(params.hash));
  },
  async "git:commitFileDiff"(params, ctx) {
    return gitService.getCommitFileDiff(rootOf(params, ctx), asString(params.hash), asString(params.filePath));
  },
  async "git:discard"(params, ctx) {
    return gitService.discardChanges(
      rootOf(params, ctx),
      asString(params.filePath),
      params.staged === true,
      params.untracked === true,
      asString(params.worktreeStatus),
    );
  },
  async "git:revert"(params, ctx) {
    return gitService.revertCommit(rootOf(params, ctx), asString(params.hash));
  },
  async "git:reset"(params, ctx) {
    const mode = params.mode === "soft" || params.mode === "mixed" || params.mode === "hard"
      ? params.mode
      : "mixed";
    return gitService.resetToCommit(rootOf(params, ctx), asString(params.hash), mode);
  },
  async "git:merge"(params, ctx) {
    return gitService.mergeBranch(rootOf(params, ctx), asString(params.sourceBranch));
  },
  async "git:mergeNoCommit"(params, ctx) {
    return gitService.mergeNoCommit(rootOf(params, ctx), asString(params.sourceBranch));
  },
  async "git:abortMerge"(params, ctx) {
    return gitService.abortMerge(rootOf(params, ctx));
  },
  async "git:stash"(params, ctx) {
    return gitService.stashPush(rootOf(params, ctx), typeof params.message === "string" ? params.message : undefined);
  },
  async "git:stashPop"(params, ctx) {
    return gitService.stashPop(rootOf(params, ctx));
  },
  async "git:commit"(params, ctx) {
    return gitService.commit(rootOf(params, ctx), asString(params.message));
  },
  async "git:commitAll"(params, ctx) {
    return gitService.commitAll(rootOf(params, ctx), asStringList(params.filePaths), asString(params.message));
  },
  async "git:deleteBranch"(params, ctx) {
    return gitService.deleteBranch(rootOf(params, ctx), asString(params.branch));
  },
  async "git:push"(params, ctx) {
    return gitService.pushBranch(rootOf(params, ctx), {
      remote: typeof params.remote === "string" ? params.remote : undefined,
    });
  },
  async "git:remotes"(params, ctx) {
    return gitService.listRemotes(rootOf(params, ctx));
  },
  async "git:addRemote"(params, ctx) {
    return gitService.addRemote(rootOf(params, ctx), {
      name: asString(params.name),
      url: asString(params.url),
    });
  },
  async "git:fetch"(params, ctx) {
    return gitService.fetchRemote(rootOf(params, ctx), {
      remote: typeof params.remote === "string" ? params.remote : undefined,
      all: params.all === true,
    });
  },
  async "git:pull"(params, ctx) {
    return gitService.pullRemote(rootOf(params, ctx));
  },
  async "git:checkIgnore"(params, ctx) {
    return gitService.checkIgnoredPaths(rootOf(params, ctx), asStringList(params.relativePaths));
  },
};
