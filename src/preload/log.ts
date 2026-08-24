import { ipcRenderer } from "electron";

export const logApi = {
	// Log system
	logFetch: (params: unknown) => ipcRenderer.invoke("log:fetch", params),
};
