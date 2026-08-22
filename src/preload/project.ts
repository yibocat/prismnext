import { ipcRenderer } from "electron";
import type { WorkspaceFolder } from "../shared/workbench/workspace-folder";
import type { IconSpec } from "../shared/platform/icon-spec";

export const projectApi = {
	projectCreate: (
		rootPath: string,
		workspaceDirs?: WorkspaceFolder[],
		options?: {
			initGit?: boolean;
			projectIcon?: IconSpec | string | null;
			projectIconImagePngBase64?: string;
		},
	) =>
		ipcRenderer.invoke("project:create", {
			rootPath,
			workspaceDirs,
			initGit: options?.initGit,
			projectIcon: options?.projectIcon,
			projectIconImagePngBase64: options?.projectIconImagePngBase64,
		}),
	projectSetIcon: (rootPath: string, icon: IconSpec | null) =>
		ipcRenderer.invoke("project:setIcon", { rootPath, icon }),
	projectSetIconImage: (rootPath: string, pngBase64: string) =>
		ipcRenderer.invoke("project:setIconImage", { rootPath, pngBase64 }),
	projectOpen: (rootPath: string) => ipcRenderer.invoke("project:open", { rootPath }),
	projectActivate: (rootPath: string) => ipcRenderer.invoke("project:activate", { rootPath }),
	projectClose: () => ipcRenderer.invoke("project:close"),
	projectEnsure: (rootPath: string) => ipcRenderer.invoke("project:ensure", { rootPath }),
	projectScaffoldAgentsMd: (rootPath: string) =>
		ipcRenderer.invoke("project:scaffoldAgentsMd", { rootPath }),
	projectCheck: (rootPath: string) => ipcRenderer.invoke("project:check", { rootPath }),
};
