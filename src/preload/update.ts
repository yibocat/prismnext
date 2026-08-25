import { ipcRenderer } from "electron";

export const updateApi = {
	// App updater — electron-updater (packaged) / version.json (dev QA).
	updateCheck: () => ipcRenderer.invoke("update:check"),
	updateStatus: () => ipcRenderer.invoke("update:status"),
	updateDownload: () => ipcRenderer.invoke("update:download"),
	updateInstall: () => ipcRenderer.invoke("update:install"),
	updateIgnore: (version: string) => ipcRenderer.invoke("update:ignore", { version }),
	updateUnignore: () => ipcRenderer.invoke("update:unignore"),
	onUpdateProgress: (callback: (data: { percent: number }) => void) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				data: { percent: number },
			) => callback(data);
			ipcRenderer.on("update:progress", handler);
			return () => ipcRenderer.removeListener("update:progress", handler);
		},
	onUpdateChanged: (callback: (status: unknown) => void) => {
			const handler = (_event: Electron.IpcRendererEvent, status: unknown) =>
				callback(status);
			ipcRenderer.on("update:changed", handler);
			return () => ipcRenderer.removeListener("update:changed", handler);
		},
	aboutGetVersions: () => ipcRenderer.invoke("about:getVersions"),
};
