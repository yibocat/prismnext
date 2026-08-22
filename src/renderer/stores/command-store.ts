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
import { APP_COMMANDS_OWNER_ID } from "@shared/teams/types";
import { useTeamsStore } from "./teams-store";
import { commandsDesktop } from "@/lib/desktop-api/commands";
import { teamsDesktop } from "@/lib/desktop-api/teams";

interface CommandState {
  commands: CommandDef[];
  loaded: boolean;
  /** FQIDs allowed in `/` menu: app commands ∪ active team roster. null = not ready. */
  slashAllowFqids: Set<string> | null;

  loadCommands: () => Promise<void>;
  refreshSlashAllow: () => Promise<void>;
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
  slashAllowFqids: null,

  loadCommands: async () => {
    try {
      const { useDocumentStore } = await import("./document-store");
      const projectRoot = useDocumentStore.getState().projectRoot;
      const commands = await commandsDesktop.commandsList(projectRoot);
      set({ commands, loaded: true });
      await get().refreshSlashAllow();
    } catch (err) {
      console.error("[command-store] Failed to load commands:", err);
      set({ loaded: true });
    }
  },

  refreshSlashAllow: async () => {
    try {
      const { useDocumentStore } = await import("./document-store");
      const projectRoot = useDocumentStore.getState().projectRoot;
      if (!projectRoot) {
        set({ slashAllowFqids: null });
        return;
      }
      const activeTeamId = useTeamsStore.getState().activeTeamId;
      const roster = activeTeamId
        ? await teamsDesktop.teamsGetCommandsRoster(projectRoot, activeTeamId)
        : null;
      const allow = new Set<string>();
      for (const c of get().commands) {
        if (c.enabled && c.teamId === APP_COMMANDS_OWNER_ID) allow.add(c.id);
      }
      for (const entry of roster?.entries ?? []) {
        if (!entry.unavailable) allow.add(entry.fqid);
      }
      set({ slashAllowFqids: allow });
    } catch {
      set({ slashAllowFqids: null });
    }
  },

  searchCommands: (query: string) => {
    const q = query.toLowerCase();
    const allow = get().slashAllowFqids;
    return get()
      .commands.filter((c) => c.enabled)
      .filter((c) => (allow ? allow.has(c.id) : true))
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aApp = a.teamId === APP_COMMANDS_OWNER_ID ? 0 : 1;
        const bApp = b.teamId === APP_COMMANDS_OWNER_ID ? 0 : 1;
        if (aApp !== bApp) return aApp - bApp;
        return a.order - b.order;
      });
  },

  expandCommand: async (name: string, rawInput: string) => {
    const projectRoot = await getProjectRoot();
    return commandsDesktop.commandsExpand(name, rawInput, projectRoot);
  },

  createCommand: async (payload) => {
    const projectRoot = await getProjectRoot();
    const created = await commandsDesktop.commandsCreate(projectRoot, payload);
    await get().reloadCommands();
    return created;
  },

  updateCommand: async (id, payload) => {
    const projectRoot = await getProjectRoot();
    const updated = await commandsDesktop.commandsUpdate(projectRoot, id, payload);
    await get().reloadCommands();
    return updated;
  },

  deleteCommand: async (id) => {
    const projectRoot = await getProjectRoot();
    await commandsDesktop.commandsDelete(projectRoot, id);
    await get().reloadCommands();
  },

  toggleCommand: async (id, enabled) => {
    const prev = get().commands;
    set({
      commands: prev.map((cmd) => (cmd.id === id ? { ...cmd, enabled } : cmd)),
    });
    try {
      const projectRoot = await getProjectRoot();
      const updated = await commandsDesktop.commandsToggle(projectRoot, id, enabled);
      set({ commands: updated });
      await get().refreshSlashAllow();
    } catch {
      set({ commands: prev });
    }
  },

  reloadCommands: async () => {
    const { useDocumentStore } = await import("./document-store");
    const projectRoot = useDocumentStore.getState().projectRoot;
    const commands = await commandsDesktop.commandsReload(projectRoot);
    set({ commands });
    await get().refreshSlashAllow();
  },

  previewImport: (projectRoot, pack) =>
    commandsDesktop.commandsPreviewImport(projectRoot, pack),

  importPack: (projectRoot, pack, strategy) =>
    commandsDesktop.commandsImportPack(projectRoot, pack, strategy),

  writeExportFile: (filePath, projectRoot) =>
    commandsDesktop.commandsWriteExportFile(filePath, projectRoot),

  readImportFile: (filePath) => commandsDesktop.commandsReadImportFile(filePath),
}));
