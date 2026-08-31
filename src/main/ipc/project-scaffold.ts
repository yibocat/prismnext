import { ipcMain } from "electron";
import { basename, join } from "node:path";
import { mkdirSync } from "node:fs";
import { createLogger, shortLogDetail } from "../app/logger";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import { buildAgentsMdScaffold } from "../project/agents-md-scaffold";
import {
  createWorkbenchProjectOnDisk,
  ensureWorkbenchProjectMeta,
  checkWorkbenchProject,
  projectMetaAbs,
} from "../workbench/scaffold";
import { routeHostDomainMethod } from "../remote/domain-route";
import { getRemoteSessionBroker } from "./remote";

const fsLog = createLogger("fs-ipc", "fs");

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  return routeHostDomainMethod(method, args, {
    keys: ["rootPath", "projectRoot"],
    broker: getRemoteSessionBroker(),
  });
}

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
    const routed = await routeIfRemote("project:create", args);
    if (routed !== undefined) return routed;

    let failLogged = false;

    try {
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
    const routed = await routeIfRemote("project:ensure", args);
    if (routed !== undefined) return routed;
    ensureWorkbenchProjectMeta(args.rootPath);
    return { success: true };
  });

  ipcMain.handle("project:scaffoldAgentsMd", async (_event, args: { rootPath: string }) => {
    const routed = await routeIfRemote("project:scaffoldAgentsMd", args);
    if (routed !== undefined) return routed;
    mkdirSync(join(projectMetaAbs(args.rootPath), "agent"), { recursive: true });
    return await buildAgentsMdScaffold(args.rootPath);
  });

  ipcMain.handle("project:check", async (_event, args: { rootPath: string }) => {
    const routed = await routeIfRemote("project:check", args);
    if (routed !== undefined) return routed;
    return checkWorkbenchProject(args.rootPath);
  });
}
