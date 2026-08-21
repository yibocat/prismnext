import { ipcMain } from "electron";
import type { WorkbenchState } from "../../shared/workbench-api";
import {
  getWorkbenchState,
  openWorkbenchFolder,
  removeWorkbenchProject,
  setDefaultFromFolder,
  setDefaultProjectId,
  syncWorkbenchRegisteredRoots,
} from "../workbench/default-project";

export function registerWorkbenchHandlers(): void {
  ipcMain.handle("workbench:getState", async (): Promise<WorkbenchState> => {
    const state = getWorkbenchState();
    syncWorkbenchRegisteredRoots();
    return state;
  });

  ipcMain.handle(
    "workbench:setDefault",
    async (_event, args: { projectId: string }): Promise<WorkbenchState> => {
      setDefaultProjectId(args.projectId);
      syncWorkbenchRegisteredRoots();
      return getWorkbenchState();
    },
  );

  ipcMain.handle(
    "workbench:setDefaultFromFolder",
    async (_event, args: { absPath: string }): Promise<WorkbenchState> => {
      setDefaultFromFolder(args.absPath);
      syncWorkbenchRegisteredRoots();
      return getWorkbenchState();
    },
  );

  ipcMain.handle(
    "workbench:openFolder",
    async (_event, args: { absPath: string }): Promise<WorkbenchState> => {
      openWorkbenchFolder(args.absPath);
      syncWorkbenchRegisteredRoots();
      return getWorkbenchState();
    },
  );

  ipcMain.handle(
    "workbench:removeProject",
    async (_event, args: { projectId: string }): Promise<WorkbenchState> => {
      const state = removeWorkbenchProject(args.projectId);
      syncWorkbenchRegisteredRoots();
      return state;
    },
  );
}
