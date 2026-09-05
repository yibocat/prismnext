// prism-next/src/main/ipc/workspace.ts

import { ipcMain } from "electron";
import {
  readWorkspaceDirs,
  writeWorkspaceDirs,
  validateWorkspaceDirs,
  createConfiguredFolders,
  ensureMainTex,
} from "../project/workspace-config";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import { routeHostDomainMethod } from "../remote/domain-route";
import { getRemoteSessionBroker } from "./remote";
import { invalidatePromptContextCache, promptManager } from "../prompts";

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  return routeHostDomainMethod(method, args, {
    keys: ["projectRoot"],
    broker: getRemoteSessionBroker(),
    disconnected(name) {
      if (name === "workspace:getConfig") {
        return { hit: true, result: [] };
      }
      return { hit: false };
    },
  });
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(
    "workspace:getConfig",
    async (
      _event,
      args: { projectRoot: string },
    ): Promise<WorkspaceFolder[]> => {
      const routed = await routeIfRemote("workspace:getConfig", args);
      if (routed !== undefined) return routed as WorkspaceFolder[];
      return readWorkspaceDirs(args.projectRoot);
    },
  );

  ipcMain.handle(
    "workspace:updateConfig",
    async (
      _event,
      args: { projectRoot: string; dirs: WorkspaceFolder[] },
    ): Promise<{ success: boolean; errors?: string[] }> => {
      const routed = await routeIfRemote("workspace:updateConfig", args);
      if (routed !== undefined) {
        promptManager.invalidate();
        invalidatePromptContextCache(args.projectRoot);
        return routed as { success: boolean; errors?: string[] };
      }
      const errors = validateWorkspaceDirs(args.dirs);
      if (errors.length > 0) {
        return { success: false, errors };
      }
      writeWorkspaceDirs(args.projectRoot, args.dirs);
      promptManager.invalidate();
      invalidatePromptContextCache(args.projectRoot);
      return { success: true };
    },
  );

  ipcMain.handle(
    "workspace:createFolders",
    async (
      _event,
      args: { projectRoot: string; dirs?: WorkspaceFolder[] },
    ): Promise<{ created: string[]; errors: { folder: string; error: string }[] }> => {
      const routed = await routeIfRemote("workspace:createFolders", args);
      if (routed !== undefined) {
        return routed as { created: string[]; errors: { folder: string; error: string }[] };
      }
      const dirs = args.dirs ?? readWorkspaceDirs(args.projectRoot);
      return createConfiguredFolders(args.projectRoot, dirs);
    },
  );

  ipcMain.handle(
    "workspace:ensureMainTex",
    async (
      _event,
      args: { projectRoot: string },
    ): Promise<{ created: boolean; relativePath?: string }> => {
      const routed = await routeIfRemote("workspace:ensureMainTex", args);
      if (routed !== undefined) return routed as { created: boolean; relativePath?: string };
      return ensureMainTex(args.projectRoot);
    },
  );
}
