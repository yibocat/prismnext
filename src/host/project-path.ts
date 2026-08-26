import { join } from "node:path";
import { RemoteOperationError } from "../shared/remote";
import { PROJECTS_DIRNAME, WORKTREES_DIRNAME } from "../shared/workbench/paths";
import { resolveWorkbenchHome } from "../main/workbench/home";
import type { HostHandlerContext } from "./context";
import { assertContainedInAny } from "./path-guard";

export function requireRemoteRoot(ctx: HostHandlerContext): string {
  if (!ctx.remoteRoot) {
    throw new RemoteOperationError("not_connected", "No remote project is bound on this connection.");
  }
  return ctx.remoteRoot;
}

export function hostWorktreeHangar(ctx: HostHandlerContext): string | null {
  const projectId = ctx.projectId?.trim();
  if (!projectId) return null;
  return join(resolveWorkbenchHome(), PROJECTS_DIRNAME, projectId, WORKTREES_DIRNAME);
}

/** Paper folder, or that project's `~/.prismnext/projects/<id>/worktrees` hangar. */
export function resolveHostProjectPath(ctx: HostHandlerContext, absPath: string): string {
  const roots = [requireRemoteRoot(ctx)];
  const hangar = hostWorktreeHangar(ctx);
  if (hangar) roots.push(hangar);
  return assertContainedInAny(roots, absPath);
}
