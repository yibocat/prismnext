import { ipcRenderer } from "electron";
import type { IconSpec } from "../shared/platform/icon-spec";

export const teamsApi = {
	// Agent Packs（生命周期 + 视图，§9.5）
	teamsList: (projectRoot: string) =>
		ipcRenderer.invoke("teams:list", { projectRoot }),
	teamsInstall: (teamId: string) =>
		ipcRenderer.invoke("teams:install", { teamId }),
	teamsSetEnabled: (
		projectRoot: string,
		teamId: string,
		enabled: boolean | null,
		scope?: "app" | "project",
	) => ipcRenderer.invoke("teams:setEnabled", { projectRoot, teamId, enabled, scope }),
	teamsUninstall: (teamId: string) =>
		ipcRenderer.invoke("teams:uninstall", { teamId }),
	teamsSetAssetEnabled: (
		projectRoot: string,
		fqid: string,
		enabled: boolean | null,
		scope?: "app" | "project",
	) => ipcRenderer.invoke("teams:setAssetEnabled", { projectRoot, fqid, enabled, scope }),
	teamsSaveAssetOverride: (
		projectRoot: string,
		fqid: string,
		patch: import("@shared/teams/types").AssetOverride,
		scope?: "app" | "project",
	) => ipcRenderer.invoke("teams:saveAssetOverride", { projectRoot, fqid, patch, scope }),
	teamsGetActiveTeam: (projectRoot: string, sessionTeamId?: string | null) =>
		ipcRenderer.invoke("teams:getActiveTeam", { projectRoot, sessionTeamId }),
	teamsSetActiveTeam: (projectRoot: string, teamId: string, scope?: "project" | "app") =>
		ipcRenderer.invoke("teams:setActiveTeam", { projectRoot, teamId, scope }),
	teamsGetRoster: (projectRoot: string, teamId: string) =>
		ipcRenderer.invoke("teams:getRoster", { projectRoot, teamId }),
	teamsGetSkillsRoster: (projectRoot: string, teamId: string) =>
		ipcRenderer.invoke("teams:getSkillsRoster", { projectRoot, teamId }),
	teamsGetCommandsRoster: (projectRoot: string, teamId: string) =>
		ipcRenderer.invoke("teams:getCommandsRoster", { projectRoot, teamId }),
	teamsCreate: (
		projectRoot: string,
		input: {
			name: string;
			description?: string;
			longDescription?: string;
			tags?: string[];
			scope: "app" | "project";
			leadName?: string;
			leadInstructions?: string;
			icon?: IconSpec | null;
			iconImagePngBase64?: string;
		},
	) => ipcRenderer.invoke("teams:create", { projectRoot, ...input }),
	teamsUpdateIcon: (
		teamId: string,
		icon: IconSpec | null,
		projectRoot?: string | null,
	) => ipcRenderer.invoke("teams:updateIcon", { teamId, icon, projectRoot }),
	teamsSetIconImage: (
		teamId: string,
		pngBase64: string,
		projectRoot?: string | null,
	) => ipcRenderer.invoke("teams:setIconImage", { teamId, pngBase64, projectRoot }),
	teamsDelete: (teamId: string, projectRoot?: string) =>
		ipcRenderer.invoke("teams:delete", { teamId, projectRoot }),
	teamsGetCoreState: (projectRoot: string) =>
		ipcRenderer.invoke("teams:getCoreState", { projectRoot }),
	teamsResetCoreDefaults: (projectRoot: string, kind: "subagent" | "orchestrator") =>
		ipcRenderer.invoke("teams:resetCoreDefaults", { projectRoot, kind }),
	teamsResolveOrigin: (projectRoot: string, fqidOrId: string) =>
		ipcRenderer.invoke("teams:resolveOrigin", { projectRoot, fqidOrId }),
	teamsListAssets: (projectRoot: string, kind: string) =>
		ipcRenderer.invoke("teams:listAssets", { projectRoot, kind }),
	teamsSetDefaultOrchestrator: (projectRoot: string, fqid: string) =>
		ipcRenderer.invoke("teams:setDefaultOrchestrator", { projectRoot, fqid }),
	teamsGetTeamContents: (teamId: string, projectRoot?: string | null) =>
		ipcRenderer.invoke("teams:getTeamContents", { teamId, projectRoot }),
	teamsListProjectMcps: (projectRoot: string) =>
		ipcRenderer.invoke("teams:listProjectMcps", { projectRoot }),
	teamsListMcp: (projectRoot: string) =>
		ipcRenderer.invoke("teams:listMcp", { projectRoot }) as Promise<
			Array<{ name: string; enabled: boolean; origin: string; autoStart: boolean }>
		>,
	// User teams (app-level, like installed teams)
	teamsListUserTeams: () =>
		ipcRenderer.invoke("teams:listUserTeams") as Promise<
			Array<{ teamId: string; name: string; description: string; version: string }>
		>,
	teamsCreateUserTeam: (name: string, description?: string) =>
		ipcRenderer.invoke("teams:createUserTeam", { name, description }) as Promise<{
			teamId: string;
			name: string;
			description: string;
			version: string;
		}>,
	teamsDeleteUserTeam: (teamId: string) =>
		ipcRenderer.invoke("teams:deleteUserTeam", { teamId }),
};
