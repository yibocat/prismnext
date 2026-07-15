import { create } from "zustand";
import {
  parseMcpConfig,
  serializeMcpConfig,
  type McpServerEntry,
} from "@/lib/agent/mcp-config";
import { isBuiltinMcpServer } from "@/lib/agent/mcp-presets";

function mcpPathFor(projectRoot: string): string {
  return `${projectRoot.replace(/[/\\]+$/, "")}/.prismnext/agent/mcp.json`;
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
      // Ensures built-in Paper Search MCP is present + enabled on disk.
      await window.electronAPI.mcpEnsure(projectRoot);
      const exists = await window.electronAPI.fsExists(mcpPath);
      if (!exists) {
        set({ servers: [], loaded: true });
        return;
      }
      const result = await window.electronAPI.fsRead(mcpPath);
      set({ servers: parseMcpConfig(result?.content ?? ""), loaded: true });
    } catch {
      set({ servers: [], loaded: true });
    }
  },

  persist: async (projectRoot, next) => {
    // Built-in servers cannot be removed or disabled via Settings.
    const guarded = next.map((s) =>
      isBuiltinMcpServer(s.name) ? { ...s, enabled: true } : s,
    );
    const names = new Set(guarded.map((s) => s.name));
    const prev = get().servers;
    for (const s of prev) {
      if (isBuiltinMcpServer(s.name) && !names.has(s.name)) {
        guarded.unshift({ ...s, enabled: true });
      }
    }
    set({ servers: guarded, projectRoot, saving: true });
    try {
      await window.electronAPI.fsWrite(mcpPathFor(projectRoot), serializeMcpConfig(guarded));
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
    if (!exists) return "{\n  \"mcpServers\": {}\n}\n";
    const result = await window.electronAPI.fsRead(mcpPath);
    return result?.content ?? "";
  },

  writeRaw: async (projectRoot, content) => {
    set({ saving: true });
    try {
      const mcpPath = mcpPathFor(projectRoot);
      await window.electronAPI.fsWrite(mcpPath, content);
      await window.electronAPI.mcpApply(projectRoot);
      const result = await window.electronAPI.fsRead(mcpPath);
      set({
        servers: parseMcpConfig(result?.content ?? ""),
        projectRoot,
      });
    } finally {
      set({ saving: false });
    }
  },
}));

export function mcpJsonRelPath(): string {
  return ".prismnext/agent/mcp.json";
}
