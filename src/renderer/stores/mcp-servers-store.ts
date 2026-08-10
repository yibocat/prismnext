import { create } from "zustand";
import {
  parseMcpConfig,
  parseTeamMcpConfig,
  serializeTeamMcpConfig,
  type McpServerEntry,
} from "@/lib/agent/mcp-config";

function mcpPathFor(projectRoot: string): string {
  return `${projectRoot.replace(/[/\\]+$/, "")}/.prismnext/agent/teams/project.local/mcp.json`;
}

interface McpServersState {
  servers: McpServerEntry[];
  loaded: boolean;
  saving: boolean;
  projectRoot: string | null;
  load: (projectRoot: string | null) => Promise<void>;
  persist: (projectRoot: string, next: McpServerEntry[]) => Promise<void>;
  readRaw: (projectRoot: string) => Promise<string>;
  writeRaw: (projectRoot: string, content: string) => Promise<void>;
}

export const useMcpServersStore = create<McpServersState>()((set, get) => ({
  servers: [],
  loaded: false,
  saving: false,
  projectRoot: null,

  load: async (projectRoot) => {
    set({ projectRoot, loaded: false });
    if (!projectRoot) {
      set({ servers: [], loaded: true });
      return;
    }
    const mcpPath = mcpPathFor(projectRoot);
    try {
      // M11 creates the v2 project.local array and removes retired MCPs.
      await window.electronAPI.mcpEnsure(projectRoot);
      const exists = await window.electronAPI.fsExists(mcpPath);
      if (!exists) {
        set({ servers: [], loaded: true });
        return;
      }
      const result = await window.electronAPI.fsRead(mcpPath);
      set({ servers: parseTeamMcpConfig(result?.content ?? ""), loaded: true });
    } catch {
      set({ servers: [], loaded: true });
    }
  },

  persist: async (projectRoot, next) => {
    const prev = get().servers;
    set({ servers: next, projectRoot, saving: true });
    try {
      await window.electronAPI.fsWrite(mcpPathFor(projectRoot), serializeTeamMcpConfig(next));
      await Promise.all(
        next.map((entry) =>
          window.electronAPI.teamsSetAssetEnabled(
            projectRoot,
            `project.local:${entry.name.trim()}`,
            entry.enabled,
            "project",
          ),
        ),
      );
      await window.electronAPI.mcpApply(projectRoot);
    } catch {
      set({ servers: prev });
      throw new Error("Failed to save MCP configuration");
    } finally {
      set({ saving: false });
    }
  },

  readRaw: async (projectRoot) => {
    const mcpPath = mcpPathFor(projectRoot);
    const exists = await window.electronAPI.fsExists(mcpPath);
    if (!exists) return "[]\n";
    const result = await window.electronAPI.fsRead(mcpPath);
    return result?.content ?? "";
  },

  writeRaw: async (projectRoot, content) => {
    set({ saving: true });
    try {
      const mcpPath = mcpPathFor(projectRoot);
      const trimmed = content.trim();
      const parsed = trimmed.startsWith("[")
        ? parseTeamMcpConfig(content)
        : parseMcpConfig(content);
      await window.electronAPI.fsWrite(mcpPath, serializeTeamMcpConfig(parsed));
      await window.electronAPI.mcpApply(projectRoot);
      set({
        servers: parsed,
        projectRoot,
      });
    } finally {
      set({ saving: false });
    }
  },
}));

export function mcpJsonRelPath(): string {
  return ".prismnext/agent/teams/project.local/mcp.json";
}
