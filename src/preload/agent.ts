import { ipcRenderer } from "electron";

export const agentApi = {
	agentListSkills: (projectPath: string) => ipcRenderer.invoke("agent:listSkills", { projectPath }),
	agentListRules: (projectPath: string) => ipcRenderer.invoke("agent:listRules", { projectPath }),
	agentInstallRule: (projectPath: string, ruleId: string, content: string) =>
		ipcRenderer.invoke("agent:installRule", { projectPath, ruleId, content }),
	agentDeleteRule: (projectPath: string, ruleId: string) =>
		ipcRenderer.invoke("agent:deleteRule", { projectPath, ruleId }),
	agentSetRuleEnabled: (projectPath: string, ruleId: string, enabled: boolean) =>
		ipcRenderer.invoke("agent:setRuleEnabled", { projectPath, ruleId, enabled }),
	agentListSkillRegistries: (projectPath: string) =>
		ipcRenderer.invoke("agent:listSkillRegistries", { projectPath }),
	agentListSkillLibrarySources: (projectPath: string) =>
		ipcRenderer.invoke("agent:listSkillLibrarySources", { projectPath }),
	agentAddSkillLibrarySource: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:addSkillLibrarySource", { projectPath, registryUrl }),
	agentFetchSkillLibraryCatalog: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:fetchSkillLibraryCatalog", { projectPath, sourceId }),
	agentInstallLibraryCatalogItem: (
		projectPath: string,
		item: import("../shared/skills/library-types").LibraryCatalogItem,
	) => ipcRenderer.invoke("agent:installLibraryCatalogItem", { projectPath, item }),
	agentInstallAllFromLibrarySource: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:installAllFromLibrarySource", { projectPath, sourceId }),
	agentUninstallAllFromLibrarySource: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:uninstallAllFromLibrarySource", { projectPath, sourceId }),
	agentRemoveSkillLibrarySource: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:removeSkillLibrarySource", { projectPath, sourceId }),
	agentSetSkillLibrarySourceConnected: (projectPath: string, sourceId: string, connected: boolean) =>
		ipcRenderer.invoke("agent:setSkillLibrarySourceConnected", { projectPath, sourceId, connected }),
	agentListBundledSkills: () => ipcRenderer.invoke("agent:listBundledSkills"),
	agentInstallBundledSkill: (projectPath: string, skillId: string) =>
		ipcRenderer.invoke("agent:installBundledSkill", { projectPath, skillId }),
	agentReadBundledSkillMd: (skillId: string) =>
		ipcRenderer.invoke("agent:readBundledSkillMd", { skillId }),
	agentSyncSkills: (projectPath: string) => ipcRenderer.invoke("agent:syncSkills", { projectPath }),
	agentFetchSkillRegistry: (registryUrl: string) =>
		ipcRenderer.invoke("agent:fetchSkillRegistry", { registryUrl }),
	agentConnectSkillRegistry: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:connectSkillRegistry", { projectPath, registryUrl }),
	agentDisconnectSkillRegistry: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:disconnectSkillRegistry", { projectPath, registryUrl }),
	agentSetSkillEnabled: (projectPath: string, skillId: string, enabled: boolean) =>
		ipcRenderer.invoke("agent:setSkillEnabled", { projectPath, skillId, enabled }),
	agentInstallSkill: (
		projectPath: string,
		skillId: string,
		content: string,
		targetTeamId?: string,
	) =>
		ipcRenderer.invoke("agent:installSkill", { projectPath, skillId, content, targetTeamId }),
	agentInstallSkillFromRegistry: (
		projectPath: string,
		skillName: string,
		artifactUrl: string,
		options?: {
			artifactType?: "skill-md" | "archive" | "unknown";
			files?: string[];
			indexUrl: string;
		},
	) =>
		ipcRenderer.invoke("agent:installSkillFromRegistry", {
			projectPath,
			skillName,
			artifactUrl,
			artifactType: options?.artifactType,
			files: options?.files,
			indexUrl: options?.indexUrl ?? "",
		}),
	agentAnalyzeSkillSource: (input: string) =>
		ipcRenderer.invoke("agent:analyzeSkillSource", { input }),
	agentInstallSkillPackages: (
		projectPath: string,
		selection: {
			cacheKey: string;
			packageIds: string[];
			includeShared: boolean;
			origin:
				| { adapter: "github"; repo: string; ref: string; path: string }
				| { adapter: "discovery"; indexUrl: string };
		},
	) => ipcRenderer.invoke("agent:installSkillPackages", { projectPath, selection }),
	agentReinstallSkill: (projectPath: string, skillId: string) =>
		ipcRenderer.invoke("agent:reinstallSkill", { projectPath, skillId }),
	agentCheckSkillUpdates: (projectPath: string) =>
		ipcRenderer.invoke("agent:checkSkillUpdates", { projectPath }),
	agentDeleteSkill: (projectPath: string, skillId: string) =>
		ipcRenderer.invoke("agent:deleteSkill", { projectPath, skillId }),
	agentHomeSkillsDir: () => ipcRenderer.invoke("agent:homeSkillsDir"),
	agentStatus: (args?: { projectRoot?: string }) =>
		ipcRenderer.invoke("agent:status", args),
	agentSend: (args: import("../shared/agent/api").AgentSendInput) =>
		ipcRenderer.invoke("agent:send", args),
	agentPrewarm: (args: {
		conversationId?: string;
		tabId: string;
		projectRoot: string;
		boundCheckoutPath?: string;
		sessionTeamId?: string | null;
	}) => ipcRenderer.invoke("agent:prewarm", args),
	agentCancel: (args: { conversationId: string }) =>
		ipcRenderer.invoke("agent:cancel", args),
	agentCancelSubagent: (args: import("../shared/agent/api").AgentCancelSubagentInput) =>
		ipcRenderer.invoke("agent:cancelSubagent", args),
	agentDispose: (args?: { conversationId?: string }) =>
		ipcRenderer.invoke("agent:dispose", args),
	agentResolvePermission: (args: { requestId: string; decision: "allow" | "deny" }) =>
		ipcRenderer.invoke("agent:resolvePermission", args),
	agentListSessions: (projectRoot: string) =>
		ipcRenderer.invoke("agent:listSessions", { projectRoot }),
	agentListSessionsByProjectId: (
		args: string | import("../shared/agent/api").AgentListSessionsByProjectIdArgs,
	) => {
		const payload = typeof args === "string" ? { projectId: args } : args;
		return ipcRenderer.invoke("agent:listSessionsByProjectId", payload);
	},
	agentLoadSession: (args: import("../shared/agent/api").AgentLoadSessionInput) =>
		ipcRenderer.invoke("agent:loadSession", args),
	agentRenameSession: (args: import("../shared/agent/api").AgentRenameSessionInput) =>
		ipcRenderer.invoke("agent:renameSession", args),
	agentGenerateSessionTitle: (args: import("../shared/agent/api").AgentGenerateSessionTitleInput) =>
		ipcRenderer.invoke("agent:generateSessionTitle", args),
	agentReassignSessionProject: (args: import("../shared/agent/api").AgentReassignSessionProjectInput) =>
		ipcRenderer.invoke("agent:reassignSessionProject", args),
	agentDeleteSession: (args: import("../shared/agent/api").AgentDeleteSessionInput) =>
		ipcRenderer.invoke("agent:deleteSession", args),
	agentAnswerQuestion: (args: import("../shared/agent/api").AgentAnswerQuestionInput) =>
		ipcRenderer.invoke("agent:answerQuestion", args),
	agentResolvePlanSuggest: (args: import("../shared/agent/api").AgentResolvePlanSuggestInput) =>
		ipcRenderer.invoke("agent:resolvePlanSuggest", args),
	agentListModels: (args: import("../shared/agent/api").AgentListModelsInput) =>
		ipcRenderer.invoke("agent:listModels", args),
	agentListModelsCatalog: () =>
		ipcRenderer.invoke("agent:listModelsCatalog"),
	agentTestConnection: (args: import("../shared/agent/api").AgentTestConnectionInput) =>
		ipcRenderer.invoke("agent:testConnection", args),
	agentGetModelEffort: (args: import("../shared/agent/api").AgentModelEffortInput) =>
		ipcRenderer.invoke("agent:getModelEffort", args),
	agentGetEffortCatalog: () =>
		ipcRenderer.invoke("agent:getEffortCatalog"),
	agentCompact: (args: import("../shared/agent/api").AgentCompactInput) =>
		ipcRenderer.invoke("agent:compact", args),
	agentDescribeImages: (args: import("../shared/agent/api").AgentDescribeImagesInput) =>
		ipcRenderer.invoke("agent:describeImages", args),
	agentTruncateToTurn: (args: import("../shared/agent/api").AgentTruncateInput) =>
		ipcRenderer.invoke("agent:truncateToTurn", args),
	agentUndoTruncate: (args: import("../shared/agent/api").AgentUndoTruncateInput) =>
		ipcRenderer.invoke("agent:undoTruncate", args),
	agentReassignDirectory: (args: import("../shared/agent/api").AgentReassignDirectoryInput) =>
		ipcRenderer.invoke("agent:reassignDirectory", args),
	agentSyncIntensiveReading: (args: import("../shared/agent/api").AgentSyncIntensiveReadingInput) =>
		ipcRenderer.invoke("agent:syncIntensiveReading", args),
	agentGetPlanEvents: (conversationId: string) =>
		ipcRenderer.invoke("agent:getPlanEvents", { conversationId }),
	agentUpsertPlanArtifact: (args: import("../shared/agent/api").AgentPlanArtifactInput) =>
		ipcRenderer.invoke("agent:upsertPlanArtifact", args),
	agentAppendPlanDecision: (args: import("../shared/agent/api").AgentPlanDecisionInput) =>
		ipcRenderer.invoke("agent:appendPlanDecision", args),
	agentMarkPlanArtifactDiscarded: (conversationId: string) =>
		ipcRenderer.invoke("agent:markPlanArtifactDiscarded", { conversationId }),
	agentUpsertTurnMeta: (args: import("../shared/agent/api").AgentTurnMetaInput) =>
		ipcRenderer.invoke("agent:upsertTurnMeta", args),
	onAgentEvent: (callback: (event: import("../shared/agent/runtime").AgentEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: import("../shared/agent/runtime").AgentEvent) => callback(data);
		ipcRenderer.on("agent:event", handler);
		return () => ipcRenderer.removeListener("agent:event", handler);
	},
};
