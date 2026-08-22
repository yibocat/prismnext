import { ipcRenderer } from "electron";
import type { WorkspaceFolder } from "../shared/workbench/workspace-folder";

export const workspaceApi = {
	// Workspace operations
	workspaceGetConfig: (projectRoot: string) =>
		ipcRenderer.invoke("workspace:getConfig", { projectRoot }),
	workspaceUpdateConfig: (projectRoot: string, dirs: WorkspaceFolder[]) =>
		ipcRenderer.invoke("workspace:updateConfig", { projectRoot, dirs }),
	workspaceCreateFolders: (projectRoot: string, dirs?: WorkspaceFolder[]) =>
		ipcRenderer.invoke("workspace:createFolders", { projectRoot, dirs }),
	workspaceEnsureMainTex: (projectRoot: string) =>
		ipcRenderer.invoke("workspace:ensureMainTex", { projectRoot }) as Promise<{ created: boolean; relativePath?: string }>,
};
