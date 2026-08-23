import { ipcRenderer } from "electron";

export const workbenchApi = {
	workbenchGetState: () => ipcRenderer.invoke("workbench:getState"),
	workbenchSetDefault: (projectId: string) =>
		ipcRenderer.invoke("workbench:setDefault", { projectId }),
	workbenchSetDefaultFromFolder: (absPath: string) =>
		ipcRenderer.invoke("workbench:setDefaultFromFolder", { absPath }),
	workbenchOpenFolder: (absPath: string) =>
		ipcRenderer.invoke("workbench:openFolder", { absPath }),
	workbenchRemoveProject: (projectId: string) =>
		ipcRenderer.invoke("workbench:removeProject", { projectId }),
	workbenchUpdateDisplayName: (projectId: string, displayName: string) =>
		ipcRenderer.invoke("workbench:updateDisplayName", { projectId, displayName }),
	workbenchReorderProjects: (projectIds: string[]) =>
		ipcRenderer.invoke("workbench:reorderProjects", { projectIds }),
};
