import { ipcRenderer } from "electron";

export const commandsApi = {
	// Commands operations
	commandsList: (projectRoot?: string | null) =>
		ipcRenderer.invoke("commands:list", { projectRoot }),
	commandsExpand: (name: string, rawInput: string, projectRoot: string) =>
		ipcRenderer.invoke("commands:expand", { name, rawInput, projectRoot }),
	commandsCreate: (
		projectRoot: string,
		payload: import("../main/commands/types").CreateCommandPayload,
	) => ipcRenderer.invoke("commands:create", { projectRoot, payload }),
	commandsUpdate: (
		projectRoot: string,
		id: string,
		payload: import("../main/commands/types").UpdateCommandPayload,
	) => ipcRenderer.invoke("commands:update", { projectRoot, id, payload }),
	commandsDelete: (projectRoot: string, id: string) =>
		ipcRenderer.invoke("commands:delete", { projectRoot, id }),
	commandsToggle: (projectRoot: string, id: string, enabled: boolean) =>
		ipcRenderer.invoke("commands:toggle", { projectRoot, id, enabled }),
	commandsReload: (projectRoot?: string | null) =>
		ipcRenderer.invoke("commands:reload", { projectRoot }),
	commandsPreviewImport: (projectRoot: string, pack: unknown) =>
		ipcRenderer.invoke("commands:previewImport", { projectRoot, pack }),
	commandsImportPack: (
		projectRoot: string,
		pack: unknown,
		strategy: "skip" | "replace" | "rename",
	) => ipcRenderer.invoke("commands:importPack", { projectRoot, pack, strategy }),
	commandsWriteExportFile: (filePath: string, projectRoot: string) =>
		ipcRenderer.invoke("commands:writeExportFile", { filePath, projectRoot }),
	commandsReadImportFile: (filePath: string) =>
		ipcRenderer.invoke("commands:readImportFile", { filePath }),
};
