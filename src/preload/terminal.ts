import { ipcRenderer } from "electron";

export const terminalApi = {
	// Terminal operations
	terminalCreate: (args: {
		sessionId: string;
		tabId: string;
		projectRoot: string;
		cwd: string;
	}) => ipcRenderer.invoke("terminal:create", args),
	terminalDestroy: (args: { sessionId: string }) =>
		ipcRenderer.invoke("terminal:destroy", args),
	terminalDestroyTab: (args: { tabId: string }) =>
		ipcRenderer.invoke("terminal:destroyTab", args),
	terminalDestroyTabs: (args: { tabIds: string[] }) =>
		ipcRenderer.invoke("terminal:destroyTabs", args),
	terminalWrite: (args: { sessionId: string; data: string }) =>
		ipcRenderer.invoke("terminal:write", args),
	terminalResize: (args: { sessionId: string; cols: number; rows: number }) =>
		ipcRenderer.invoke("terminal:resize", args),
	terminalEnvInfo: () => ipcRenderer.invoke("terminal:envInfo"),
	terminalLoadConfig: (projectRoot: string) =>
		ipcRenderer.invoke("terminal:loadConfig", { projectRoot }),
	terminalSaveConfig: (projectRoot: string, config: unknown) =>
		ipcRenderer.invoke("terminal:saveConfig", { projectRoot, config }),
	terminalRegisterBashJob: (args: {
		sessionId: string;
		toolCallId: string;
		command: string;
	}) => ipcRenderer.invoke("terminal:registerBashJob", args),
	terminalDestroyAllAiPty: () => ipcRenderer.invoke("terminal:destroyAllAiPty"),
	// Terminal events (Main → Renderer)
	onTerminalData: (callback: (data: { sessionId: string; tabId: string; data: string }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; tabId: string; data: string }) => callback(data);
		ipcRenderer.on("terminal:data", handler);
		return () => ipcRenderer.removeListener("terminal:data", handler);
	},
	onTerminalExit: (callback: (data: { sessionId: string; tabId: string; exitCode: number }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; tabId: string; exitCode: number }) => callback(data);
		ipcRenderer.on("terminal:exit", handler);
		return () => ipcRenderer.removeListener("terminal:exit", handler);
	},
};
