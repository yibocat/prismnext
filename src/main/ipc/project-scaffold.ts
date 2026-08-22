import { ipcMain } from "electron";
import { basename, join } from "node:path";
import { createLogger, shortLogDetail } from "../app/logger";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import {
  writeProjectIcon,
  writeProjectIconImage,
} from "../project/workspace-config";
import type { IconSpec } from "../../shared/platform/icon-spec";
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
        projectIcon?: IconSpec | string | null;
        /** Optional PNG bytes (base64) written to `.workbench/icon.png`. */
        projectIconImagePngBase64?: string;
      },
    ) => {
    let failLogged = false;

    try {
    createWorkbenchProjectOnDisk({
      rootPath: args.rootPath,
      workspaceDirs: args.workspaceDirs,
      projectIcon: args.projectIcon,
      projectIconImagePngBase64: args.projectIconImagePngBase64,
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

  ipcMain.handle(
    "project:setIcon",
    async (_event, args: { rootPath: string; icon: IconSpec | null }) => {
      writeProjectIcon(projectMetaAbs(args.rootPath), args.icon);
    },
  );

  ipcMain.handle(
    "project:setIconImage",
    async (_event, args: { rootPath: string; pngBase64: string }) => {
      writeProjectIconImage(projectMetaAbs(args.rootPath), Buffer.from(args.pngBase64, "base64"));
    },
  );

  ipcMain.handle("project:ensure", async (_event, args: { rootPath: string }) => {
    ensureWorkbenchProjectMeta(args.rootPath);
    return { success: true };
  });

  ipcMain.handle("project:scaffoldAgentsMd", async (_event, args: { rootPath: string }) => {
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(projectMetaAbs(args.rootPath), "agent"), { recursive: true });
    return await buildAgentsMdScaffold(args.rootPath);
  });

  ipcMain.handle("project:check", async (_event, args: { rootPath: string }) => {
    return checkWorkbenchProject(args.rootPath);
  });
}
