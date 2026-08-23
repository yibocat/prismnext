import { ipcMain } from "electron";
import type { WorkbenchOpenResult, WorkbenchState } from "../../shared/workbench/api";
import {
  getWorkbenchState,
  openWorkbenchFolder,
  removeWorkbenchProject,
  reorderWorkbenchProjects,
  setDefaultFromFolder,
  setDefaultProjectId,
  setProjectDisplayName,
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
    async (_event, args: { absPath: string }): Promise<WorkbenchOpenResult> => {
      const opened = openWorkbenchFolder(args.absPath);
      syncWorkbenchRegisteredRoots();
      return {
        ...getWorkbenchState(),
        openedProjectId: opened.projectId,
        openedLastPath: opened.lastPath,
      };
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

  ipcMain.handle(
    "workbench:updateDisplayName",
    async (_event, args: { projectId: string; displayName: string }): Promise<WorkbenchState> => {
      const state = setProjectDisplayName(args.projectId, args.displayName);
      return state;
    },
  );

  ipcMain.handle(
    "workbench:reorderProjects",
    async (_event, args: { projectIds: string[] }): Promise<WorkbenchState> => {
      const state = reorderWorkbenchProjects(args.projectIds);
      syncWorkbenchRegisteredRoots();
      return state;
    },
  );
}
