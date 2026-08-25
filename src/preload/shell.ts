import { ipcRenderer } from "electron";

export const shellApi = {
	shellShowItemInFolder: (absPath: string) =>
		ipcRenderer.invoke("shell:showItemInFolder", { absPath }),
	shellOpenExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", { url }),
	shellDesktopNotify: (args: {
		kind: "turn_complete" | "action_required";
		title: string;
		body: string;
		tabId?: string;
	}) => ipcRenderer.invoke("shell:desktopNotify", args),
	shellSetTrayStatus: (
		status: "idle" | "busy" | "attention",
		tooltip?: string | null,
		runningCount?: number,
	) => ipcRenderer.invoke("shell:setTrayStatus", { status, tooltip, runningCount }),
	shellSetTrayMenu: (snapshot: {
		showLabel: string;
		newChatLabel: string;
		quitLabel: string;
		recent: Array<{
			id: string;
			title: string;
			sessionId?: string;
			tabId?: string;
		}>;
		projectName?: string | null;
		modes?: Array<{
			id: "texworkspace" | "literature" | "experiments";
			label: string;
		}>;
	}) => ipcRenderer.invoke("shell:setTrayMenu", snapshot),
	onShellFocusChatTab: (callback: (args: { tabId: string }) => void) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			args: { tabId: string },
		) => callback(args);
		ipcRenderer.on("shell:focusChatTab", handler);
		return () => ipcRenderer.removeListener("shell:focusChatTab", handler);
	},
	onShellTrayNewChat: (callback: () => void) => {
		const handler = () => callback();
		ipcRenderer.on("shell:trayNewChat", handler);
		return () => ipcRenderer.removeListener("shell:trayNewChat", handler);
	},
	onShellTrayOpenRecent: (
		callback: (args: { id: string; sessionId?: string; tabId?: string }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			args: { id: string; sessionId?: string; tabId?: string },
		) => callback(args);
		ipcRenderer.on("shell:trayOpenRecent", handler);
		return () => ipcRenderer.removeListener("shell:trayOpenRecent", handler);
	},
	onShellTrayOpenMode: (
		callback: (args: {
			modeId: "texworkspace" | "literature" | "experiments";
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			args: { modeId: "texworkspace" | "literature" | "experiments" },
		) => callback(args);
		ipcRenderer.on("shell:trayOpenMode", handler);
		return () => ipcRenderer.removeListener("shell:trayOpenMode", handler);
	},
};
