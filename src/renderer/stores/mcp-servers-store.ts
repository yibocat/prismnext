import { create } from "zustand";
import {
  parseMcpConfig,
  parseTeamMcpConfig,
  serializeTeamMcpConfig,
  type McpServerEntry,
} from "@/lib/agent/mcp-config";
import { MY_CONTENT_TEAM_ID, PROJECT_DEFAULT_TEAM_ID } from "@shared/teams/types";
import { projectTeamsRel } from "@shared/workbench-paths";

interface McpServersState {
  /** Last loaded team’s entries (for the open editor / install panel). */
  servers: McpServerEntry[];
  loaded: boolean;
  saving: boolean;
  projectRoot: string | null;
  teamId: string;
  /** Bumps after any successful write so Settings lists can refresh without closing the panel. */
  revision: number;
  load: (projectRoot: string | null, teamId?: string) => Promise<void>;
  persist: (
    projectRoot: string,
    next: McpServerEntry[],
    teamId?: string,
  ) => Promise<void>;
  readRaw: (projectRoot: string, teamId?: string) => Promise<string>;
  writeRaw: (projectRoot: string, content: string, teamId?: string) => Promise<void>;
}

export const useMcpServersStore = create<McpServersState>()((set, get) => ({
  servers: [],
  loaded: false,
  saving: false,
  projectRoot: null,
  teamId: PROJECT_DEFAULT_TEAM_ID,
  revision: 0,

  load: async (projectRoot, teamId) => {
    const tid = teamId?.trim() || PROJECT_DEFAULT_TEAM_ID;
    set({ projectRoot, teamId: tid, loaded: false });
    if (!projectRoot) {
      set({ servers: [], loaded: true });
      return;
    }
    try {
      await window.electronAPI.mcpEnsure(projectRoot);
      const { content } = await window.electronAPI.mcpReadTeamJson(projectRoot, tid);
      set({ servers: parseTeamMcpConfig(content), loaded: true, teamId: tid });
    } catch {
      set({ servers: [], loaded: true });
    }
  },

  persist: async (projectRoot, next, teamId) => {
    const tid = teamId?.trim() || get().teamId || PROJECT_DEFAULT_TEAM_ID;
    const prev = get().servers;
    set({ servers: next, projectRoot, teamId: tid, saving: true });
    try {
      const result = await window.electronAPI.mcpWriteTeamJson(
        projectRoot,
        serializeTeamMcpConfig(next),
        tid,
      );
      if (!result.ok) throw new Error(result.error || "Failed to save MCP configuration");
      await Promise.all(
        next.map((entry) =>
          window.electronAPI.teamsSetAssetEnabled(
            projectRoot,
            `${tid}:${entry.name.trim()}`,
            entry.enabled !== false,
            "project",
          ),
        ),
      );
      set({ revision: get().revision + 1 });
    } catch {
      set({ servers: prev });
      throw new Error("Failed to save MCP configuration");
    } finally {
      set({ saving: false });
    }
  },

  readRaw: async (projectRoot, teamId) => {
    const tid = teamId?.trim() || get().teamId || PROJECT_DEFAULT_TEAM_ID;
    const { content } = await window.electronAPI.mcpReadTeamJson(projectRoot, tid);
    return content || "[]\n";
  },

  writeRaw: async (projectRoot, content, teamId) => {
    const tid = teamId?.trim() || get().teamId || PROJECT_DEFAULT_TEAM_ID;
    set({ saving: true });
    try {
      const trimmed = content.trim();
      const parsed = trimmed.startsWith("[")
        ? parseTeamMcpConfig(content)
        : parseMcpConfig(content);
      const result = await window.electronAPI.mcpWriteTeamJson(
        projectRoot,
        serializeTeamMcpConfig(parsed),
        tid,
      );
      if (!result.ok) throw new Error(result.error || "Failed to save MCP configuration");
      set({ servers: parsed, projectRoot, teamId: tid, revision: get().revision + 1 });
    } finally {
      set({ saving: false });
    }
  },
}));

/** User-facing storage hint for a writable team's mcp.json. */
export function mcpJsonRelPath(teamId: string = PROJECT_DEFAULT_TEAM_ID): string {
  if (teamId === MY_CONTENT_TEAM_ID) {
    return "app teams / Common Team / mcp.json";
  }
  return `${projectTeamsRel()}/${teamId}/mcp.json`;
}
