import { ipcRenderer } from "electron";

export const windowApi = {
	// Window operations
	windowSetTitle: (title: string) =>
		ipcRenderer.invoke("window:setTitle", { title }),
	windowIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),
	windowIsFullscreen: () => ipcRenderer.invoke("window:isFullscreen"),
	windowMinimize: () => ipcRenderer.invoke("window:minimize"),
	windowMaximize: () => ipcRenderer.invoke("window:maximize"),
	windowClose: () => ipcRenderer.invoke("window:close"),
	windowNew: () => ipcRenderer.invoke("window:new"),
	// Window state events (Main → Renderer)
	onWindowStateChange: (
		callback: (state: {
			isMaximized: boolean;
			isFullscreen: boolean;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			state: { isMaximized: boolean; isFullscreen: boolean },
		) => callback(state);
		ipcRenderer.on("window:stateChange", handler);
		return () => ipcRenderer.removeListener("window:stateChange", handler);
	},
	onCloseTabRequest: (callback: () => void) => {
		const handler = () => callback();
		ipcRenderer.on("app:closeTab", handler);
		return () => ipcRenderer.removeListener("app:closeTab", handler);
	},
	onSetPromptInternals: (callback: (enabled: boolean) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, enabled: boolean) => {
			callback(Boolean(enabled));
		};
		ipcRenderer.on("app:setPromptInternals", handler);
		return () => ipcRenderer.removeListener("app:setPromptInternals", handler);
	},
};
