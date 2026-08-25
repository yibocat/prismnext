import { ipcRenderer } from "electron";

export const mcpApi = {
	mcpEnsure: (projectPath: string) =>
		ipcRenderer.invoke("mcp:ensure", { projectPath }) as Promise<{
			ok: boolean;
			ensure?: {
				added?: boolean;
				migrated?: boolean;
				reenabled?: boolean;
				removed?: boolean;
			};
			reloadedSessions?: number;
		}>,
	mcpApply: (projectPath: string) =>
		ipcRenderer.invoke("mcp:apply", { projectPath }) as Promise<{
			ok: boolean;
			reloadedSessions: number;
			error?: string;
		}>,
	mcpReadTeamJson: (projectPath: string, teamId?: string) =>
		ipcRenderer.invoke("mcp:readTeamJson", { projectPath, teamId }) as Promise<{
			teamId: string;
			content: string;
		}>,
	mcpWriteTeamJson: (projectPath: string, content: string, teamId?: string) =>
		ipcRenderer.invoke("mcp:writeTeamJson", { projectPath, teamId, content }) as Promise<{
			ok: boolean;
			teamId?: string;
			reloadedSessions: number;
			error?: string;
		}>,
};
