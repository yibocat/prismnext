import { ipcRenderer } from "electron";

export const settingsApi = {
	// Settings operations
	settingsGet: () => ipcRenderer.invoke("settings:get"),
	settingsSet: (patch: Record<string, unknown>) =>
		ipcRenderer.invoke("settings:set", patch),
	settingsGetAgentProjectConfig: (projectPath: string) =>
		ipcRenderer.invoke("settings:getAgentProjectConfig", { projectPath }),
	settingsSetAgentProjectConfig: (projectPath: string, config: any) =>
		ipcRenderer.invoke("settings:setAgentProjectConfig", { projectPath, config }),
	settingsGetAssembledPrompt: (projectRoot?: string, userCustomPrompt?: string) =>
		ipcRenderer.invoke("settings:getAssembledPrompt", { projectRoot, userCustomPrompt }),
	settingsGetPromptStackPreview: (
		projectRoot?: string,
		userCustomPrompt?: string,
		orchestratorId?: string | null,
		sessionTeamId?: string | null,
	) =>
		ipcRenderer.invoke("settings:getPromptStackPreview", {
			projectRoot,
			userCustomPrompt,
			orchestratorId,
			sessionTeamId,
		}),
	settingsCountPromptTokens: (text: string) =>
		ipcRenderer.invoke("settings:countPromptTokens", { text }),
	settingsComputePromptFingerprint: (projectRoot?: string) =>
		ipcRenderer.invoke("settings:computePromptFingerprint", { projectRoot }),
	settingsGetDefaultPersona: () =>
		ipcRenderer.invoke("settings:getDefaultPersona"),
	settingsGetKnowledgeModules: (projectRoot?: string) =>
		ipcRenderer.invoke("settings:getKnowledgeModules", { projectRoot }),
	settingsGetBuiltinTools: () =>
		ipcRenderer.invoke("settings:getBuiltinTools"),
	settingsGetLayers: () =>
		ipcRenderer.invoke("settings:getLayers"),
	settingsSetLayer: (id: string, enabled: boolean) =>
		ipcRenderer.invoke("settings:setLayer", { id, enabled }),
};
