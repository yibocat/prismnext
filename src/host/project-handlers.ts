import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { randomBytes } from "node:crypto";
import { normalizePosixAbs, RemoteOperationError } from "../shared/remote";
import { registerProjectRoot } from "../main/project/active-project-roots";
import { buildAgentsMdScaffold } from "../main/project/agents-md-scaffold";
import {
  createConfiguredFolders,
  ensureMainTex,
  readWorkspaceDirs,
  validateWorkspaceDirs,
  writeWorkspaceDirs,
} from "../main/project/workspace-config";
import type { WorkspaceFolder } from "../shared/workbench/workspace-folder";
import {
  checkWorkbenchProject,
  createWorkbenchProjectOnDisk,
  ensureWorkbenchProjectMeta,
  projectMetaAbs,
} from "../main/workbench/scaffold";
import type { HostHandlerContext } from "./context";

function posixProjectRoot(params: Record<string, unknown>): string {
  const raw = String(params.rootPath ?? params.projectRoot ?? params.remoteRoot ?? "");
  const root = normalizePosixAbs(raw);
  if (!root) {
    throw new RemoteOperationError("protocol", "project root must be an absolute POSIX path.");
  }
  return root;
}

function workspaceDirsFrom(params: Record<string, unknown>): WorkspaceFolder[] | undefined {
  return Array.isArray(params.workspaceDirs)
    ? params.workspaceDirs as WorkspaceFolder[]
    : Array.isArray(params.dirs)
      ? params.dirs as WorkspaceFolder[]
      : undefined;
}

function mintProjectId(): string {
  return `p_${randomBytes(10).toString("hex")}`;
}

export const projectHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "project.open"(params, ctx) {
    const requested = normalizePosixAbs(String(params.remoteRoot ?? ""));
    if (!requested) {
      throw new RemoteOperationError("protocol", "remoteRoot must be an absolute POSIX path.");
    }
    mkdirSync(requested, { recursive: true });
    const metaDir = posix.join(requested, ".workbench");
    const jsonPath = posix.join(metaDir, "workbench.json");
    mkdirSync(metaDir, { recursive: true });
    let projectId = mintProjectId();
    let workspace: unknown;
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { id?: string; workspace?: unknown };
      if (typeof parsed.id === "string" && parsed.id.trim()) projectId = parsed.id.trim();
      workspace = parsed.workspace;
    } catch {
      // mint
    }
    const adoptId = typeof params.adoptId === "string" ? params.adoptId.trim() : "";
    if (adoptId) projectId = adoptId;
    const payload: { id: string; workspace?: unknown } = { id: projectId };
    if (workspace && typeof workspace === "object") payload.workspace = workspace;
    writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    ctx.remoteRoot = requested;
    ctx.projectId = projectId;
    registerProjectRoot(requested);
    return { projectId, remoteRoot: requested };
  },

  async "project:create"(params) {
    const root = posixProjectRoot(params);
    const workspaceDirs = workspaceDirsFrom(params);
    const ref = createWorkbenchProjectOnDisk({ rootPath: root, workspaceDirs });
    if (params.initGit === true) {
      const { initRepo } = await import("../main/git/facade");
      const git = await initRepo(root);
      if (!git.success) throw new Error(git.error || "git init failed");
    }
    return ref;
  },

  async "project:check"(params) {
    return checkWorkbenchProject(posixProjectRoot(params));
  },

  async "project:ensure"(params) {
    ensureWorkbenchProjectMeta(posixProjectRoot(params));
    return { success: true };
  },

  async "project:scaffoldAgentsMd"(params) {
    const root = posixProjectRoot(params);
    mkdirSync(join(projectMetaAbs(root), "agent"), { recursive: true });
    return buildAgentsMdScaffold(root);
  },

  async "workspace:getConfig"(params) {
    return readWorkspaceDirs(posixProjectRoot(params));
  },

  async "workspace:updateConfig"(params) {
    const root = posixProjectRoot(params);
    const dirs = workspaceDirsFrom(params) ?? [];
    const errors = validateWorkspaceDirs(dirs);
    if (errors.length > 0) return { success: false, errors };
    writeWorkspaceDirs(root, dirs);
    return { success: true };
  },

  async "workspace:createFolders"(params) {
    const root = posixProjectRoot(params);
    const dirs = workspaceDirsFrom(params) ?? readWorkspaceDirs(root);
    return createConfiguredFolders(root, dirs);
  },

  async "workspace:ensureMainTex"(params) {
    return ensureMainTex(posixProjectRoot(params));
  },
};
