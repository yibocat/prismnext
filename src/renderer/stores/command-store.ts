// prism-next/src/renderer/stores/command-store.ts
import { create } from "zustand";
import type { CommandDef, CreateCommandPayload, UpdateCommandPayload } from "@commands/types";

interface CommandState {
  /** Full command list (all three layers, including disabled) */
  commands: CommandDef[];
  /** True after initial load */
  loaded: boolean;

  // Actions
  loadCommands: () => Promise<void>;
  searchCommands: (query: string) => CommandDef[];
  expandCommand: (name: string, rawInput: string) => Promise<string>;
  createCommand: (payload: CreateCommandPayload) => Promise<CommandDef>;
  updateCommand: (id: string, payload: UpdateCommandPayload) => Promise<CommandDef>;
  deleteCommand: (id: string) => Promise<void>;
  toggleCommand: (id: string, enabled: boolean) => Promise<void>;
  reloadCommands: () => Promise<void>;
}

export const useCommandStore = create<CommandState>()((set, get) => ({
  commands: [],
  loaded: false,

  loadCommands: async () => {
    try {
      const commands = await window.electronAPI.commandsList();
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
    // Get project root from document store (avoids circular import at module level)
    const { useDocumentStore } = await import("./document-store");
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot) throw new Error("No project open");
    return window.electronAPI.commandsExpand(name, rawInput, projectRoot);
  },

  createCommand: async (payload) => {
    const created = await window.electronAPI.commandsCreate(payload);
    await get().reloadCommands();
    return created;
  },

  updateCommand: async (id, payload) => {
    const updated = await window.electronAPI.commandsUpdate(id, payload);
    await get().reloadCommands();
    return updated;
  },

  deleteCommand: async (id) => {
    await window.electronAPI.commandsDelete(id);
    await get().reloadCommands();
  },

  toggleCommand: async (id, enabled) => {
    const updated = await window.electronAPI.commandsToggle(id, enabled);
    set({ commands: updated });
  },

  reloadCommands: async () => {
    const commands = await window.electronAPI.commandsReload();
    set({ commands });
  },
}));
