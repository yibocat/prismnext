import { ipcRenderer } from "electron";

export const skillsApi = {
	onSkillsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { projectPath: string }) => callback(data);
		ipcRenderer.on("skills:integrationChanged", handler);
		return () => ipcRenderer.removeListener("skills:integrationChanged", handler);
	},
};
