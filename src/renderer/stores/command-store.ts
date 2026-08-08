import { create } from "zustand";
import type {
  CommandDef,
  CreateCommandPayload,
  UpdateCommandPayload,
} from "@commands/types";
import type {
  CommandImportConflictStrategy,
  CommandImportPreview,
  CommandImportResult,
} from "@commands/export-import";

interface CommandState {
  commands: CommandDef[];
  loaded: boolean;

  loadCommands: () => Promise<void>;
  searchCommands: (query: string) => CommandDef[];
  expandCommand: (name: string, rawInput: string) => Promise<string>;
  createCommand: (payload: CreateCommandPayload) => Promise<CommandDef>;
  updateCommand: (id: string, payload: UpdateCommandPayload) => Promise<CommandDef>;
  deleteCommand: (id: string) => Promise<void>;
  toggleCommand: (id: string, enabled: boolean) => Promise<void>;
  reloadCommands: () => Promise<void>;
  previewImport: (projectRoot: string, pack: unknown) => Promise<CommandImportPreview>;
  importPack: (
    projectRoot: string,
    pack: unknown,
    strategy: CommandImportConflictStrategy,
  ) => Promise<CommandImportResult>;
  writeExportFile: (filePath: string, projectRoot: string) => Promise<void>;
  readImportFile: (filePath: string) => Promise<unknown>;
}

async function getProjectRoot(): Promise<string> {
  const { useDocumentStore } = await import("./document-store");
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) throw new Error("No project open");
  return projectRoot;
}

export const useCommandStore = create<CommandState>()((set, get) => ({
  commands: [],
  loaded: false,

  loadCommands: async () => {
    try {
      const { useDocumentStore } = await import("./document-store");
      const projectRoot = useDocumentStore.getState().projectRoot;
      const commands = await window.electronAPI.commandsList(projectRoot);
      set({ commands, loaded: true });
    } catch (err) {
      console.error("[command-store] Failed to load commands:", err);
      set({ loaded: true });
    }
  },

  searchCommands: (query: string) => {
    const q = query.toLowerCase();
    return get()
      .commands.filter((c) => c.enabled)
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      )
      .sort((a, b) => a.order - b.order);
  },

  expandCommand: async (name: string, rawInput: string) => {
    const projectRoot = await getProjectRoot();
    return window.electronAPI.commandsExpand(name, rawInput, projectRoot);
  },

  createCommand: async (payload) => {
    const projectRoot = await getProjectRoot();
    const created = await window.electronAPI.commandsCreate(projectRoot, payload);
    await get().reloadCommands();
    return created;
  },

  updateCommand: async (id, payload) => {
    const projectRoot = await getProjectRoot();
    const updated = await window.electronAPI.commandsUpdate(projectRoot, id, payload);
    await get().reloadCommands();
    return updated;
  },

  deleteCommand: async (id) => {
    const projectRoot = await getProjectRoot();
    await window.electronAPI.commandsDelete(projectRoot, id);
    await get().reloadCommands();
  },

  toggleCommand: async (id, enabled) => {
    const prev = get().commands;
    set({
      commands: prev.map((cmd) => (cmd.id === id ? { ...cmd, enabled } : cmd)),
    });
    try {
      const projectRoot = await getProjectRoot();
      const updated = await window.electronAPI.commandsToggle(projectRoot, id, enabled);
      set({ commands: updated });
    } catch {
      set({ commands: prev });
    }
  },

  reloadCommands: async () => {
    const { useDocumentStore } = await import("./document-store");
    const projectRoot = useDocumentStore.getState().projectRoot;
    const commands = await window.electronAPI.commandsReload(projectRoot);
    set({ commands });
  },

  previewImport: (projectRoot, pack) =>
    window.electronAPI.commandsPreviewImport(projectRoot, pack),

  importPack: (projectRoot, pack, strategy) =>
    window.electronAPI.commandsImportPack(projectRoot, pack, strategy),

  writeExportFile: (filePath, projectRoot) =>
    window.electronAPI.commandsWriteExportFile(filePath, projectRoot),

  readImportFile: (filePath) => window.electronAPI.commandsReadImportFile(filePath),
}));
