import { ipcMain } from "electron";
import { basename, join } from "node:path";
import { createLogger, shortLogDetail } from "../app/logger";
import { isRemoteProjectRoot } from "../../shared/remote";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import { buildAgentsMdScaffold } from "../project/agents-md-scaffold";
import {
  createWorkbenchProjectOnDisk,
  ensureWorkbenchProjectMeta,
  checkWorkbenchProject,
  projectMetaAbs,
} from "../workbench/scaffold";

const fsLog = createLogger("fs-ipc", "fs");

export function registerProjectScaffoldHandlers(): void {
  ipcMain.handle(
    "project:create",
    async (
      _event,
      args: {
        rootPath: string;
        workspaceDirs?: WorkspaceFolder[];
        initGit?: boolean;
      },
    ) => {
    let failLogged = false;

    try {
    if (isRemoteProjectRoot(args.rootPath)) {
      throw new Error("remote_project_root_is_not_local");
    }
    createWorkbenchProjectOnDisk({
      rootPath: args.rootPath,
      workspaceDirs: args.workspaceDirs,
    });

    if (args.initGit) {
      const { initRepo } = await import("../git/facade");
      const gitResult = await initRepo(args.rootPath);
      if (!gitResult.success) {
        failLogged = true;
        fsLog.warn("project.create.fail", {
          project: basename(args.rootPath),
          reason: "git_init",
          error: shortLogDetail(gitResult.error),
        });
        throw new Error(gitResult.error || "Failed to initialize git repository");
      }
    }
    } catch (err) {
      if (!failLogged) {
        fsLog.warn("project.create.fail", {
          project: basename(args.rootPath),
          error: shortLogDetail(err),
        });
      }
      throw err;
    }
  });

  ipcMain.handle("project:ensure", async (_event, args: { rootPath: string }) => {
    if (isRemoteProjectRoot(args.rootPath)) return { success: true };
    ensureWorkbenchProjectMeta(args.rootPath);
    return { success: true };
  });

  ipcMain.handle("project:scaffoldAgentsMd", async (_event, args: { rootPath: string }) => {
    if (isRemoteProjectRoot(args.rootPath)) {
      throw new Error("remote_project_root_is_not_local");
    }
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(projectMetaAbs(args.rootPath), "agent"), { recursive: true });
    return await buildAgentsMdScaffold(args.rootPath);
  });

  ipcMain.handle("project:check", async (_event, args: { rootPath: string }) => {
    if (isRemoteProjectRoot(args.rootPath)) return { missing: [] };
    return checkWorkbenchProject(args.rootPath);
  });
}
