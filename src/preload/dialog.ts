import { ipcRenderer } from "electron";

export const dialogApi = {
	// Dialog operations
	dialogOpenFolder: () => ipcRenderer.invoke("dialog:openFolder"),
	dialogOpenFile: () => ipcRenderer.invoke("dialog:openFile"),
	dialogOpenJsonFile: () => ipcRenderer.invoke("dialog:openJsonFile"),
	dialogSaveJsonFile: (defaultPath?: string) =>
		ipcRenderer.invoke("dialog:saveJsonFile", { defaultPath }),
};
