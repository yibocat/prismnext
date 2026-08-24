import { ipcRenderer } from "electron";

export const browserApi = {
	// Browser operations
	browserInit: (projectRoot: string) => ipcRenderer.invoke("browser:init", { projectRoot }),
	browserSaveBookmarks: (projectRoot: string, bookmarks: unknown[]) =>
		ipcRenderer.invoke("browser:saveBookmarks", { projectRoot, bookmarks }),
	browserSaveRecent: (projectRoot: string, recent: unknown[]) =>
		ipcRenderer.invoke("browser:saveRecent", { projectRoot, recent }),
	browserClearCookies: () => ipcRenderer.invoke("browser:clearCookies"),
	browserClearCache: () => ipcRenderer.invoke("browser:clearCache"),
	onBrowserOpenInTab: (callback: (data: { url: string; newTab: boolean }) => void) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: { url: string; newTab: boolean },
		) => callback(data);
		ipcRenderer.on("browser:open-in-tab", handler);
		return () => ipcRenderer.removeListener("browser:open-in-tab", handler);
	},
};
