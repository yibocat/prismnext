import { ipcRenderer } from "electron";
import type { WorkspaceFolder } from "../shared/workbench/workspace-folder";

export const projectApi = {
	projectCreate: (
		rootPath: string,
		workspaceDirs?: WorkspaceFolder[],
		options?: {
			initGit?: boolean;
		},
	) =>
		ipcRenderer.invoke("project:create", {
			rootPath,
			workspaceDirs,
			initGit: options?.initGit,
		}),
	projectOpen: (rootPath: string) => ipcRenderer.invoke("project:open", { rootPath }),
	projectActivate: (rootPath: string) => ipcRenderer.invoke("project:activate", { rootPath }),
	projectClose: () => ipcRenderer.invoke("project:close"),
	projectEnsure: (rootPath: string) => ipcRenderer.invoke("project:ensure", { rootPath }),
	projectScaffoldAgentsMd: (rootPath: string) =>
		ipcRenderer.invoke("project:scaffoldAgentsMd", { rootPath }),
	projectCheck: (rootPath: string) => ipcRenderer.invoke("project:check", { rootPath }),
};
