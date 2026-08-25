import { ipcRenderer } from "electron";

export const subagentsApi = {
	subagentsList: (projectPath: string) =>
		ipcRenderer.invoke("subagents:list", { projectPath }),
	orchestratorsList: (projectPath: string) =>
		ipcRenderer.invoke("orchestrators:list", { projectPath }),
	subagentsGetDetail: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("subagents:getDetail", { projectPath, expertId }),
	subagentsSaveCustom: (
		projectPath: string,
		payload: import("@shared/agent/subagents").SaveCustomSubagentPayload,
		targetTeamId?: string,
	) => ipcRenderer.invoke("subagents:saveCustom", { projectPath, payload, targetTeamId }),
	subagentsListRosterReferrers: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("subagents:listRosterReferrers", { projectPath, expertId }),
	subagentsDeleteCustom: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("subagents:deleteCustom", { projectPath, expertId }),
	orchestratorsGetDetail: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:getDetail", { projectPath, orchestratorId }),
	orchestratorsSaveCustom: (
		projectPath: string,
		payload: import("@shared/agent/subagents").SaveCustomOrchestratorPayload,
		targetTeamId?: string,
	) => ipcRenderer.invoke("orchestrators:saveCustom", { projectPath, payload, targetTeamId }),
	orchestratorsDeleteCustom: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:deleteCustom", { projectPath, orchestratorId }),
	onExpertsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { projectPath: string }) => callback(data);
		ipcRenderer.on("subagents:integrationChanged", handler);
		return () => ipcRenderer.removeListener("subagents:integrationChanged", handler);
	},
};
