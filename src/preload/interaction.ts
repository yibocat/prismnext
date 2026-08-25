import { ipcRenderer } from "electron";

export const interactionApi = {
	interactionGet: (projectRoot: string, id: string) =>
		ipcRenderer.invoke("interaction:get", { projectRoot, id }),
	interactionList: (projectRoot: string) =>
		ipcRenderer.invoke("interaction:list", { projectRoot }),
	interactionWrite: (args: {
		projectRoot: string;
		spec: import("../shared/interaction/spec").InteractionSpec;
	}) => ipcRenderer.invoke("interaction:write", args),
	onInteractionChanged: (
		callback: (data: {
			projectRoot: string;
			id: string;
			title?: string;
			reason: string;
			focus?: boolean;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				projectRoot: string;
				id: string;
				title?: string;
				reason: string;
				focus?: boolean;
			},
		) => callback(data);
		ipcRenderer.on("interaction:changed", handler);
		return () => ipcRenderer.removeListener("interaction:changed", handler);
	},
};
