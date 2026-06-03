import { create } from "zustand";
import { useDocumentStore } from "@/stores/document-store";
import type { TerminalQuickCommand, TerminalEnvInfo } from "@/types/terminal";

// ─── Types ───

export interface TerminalSessionInfo {
  shell: string;
  cwd: string;
  pid: number;
  busy: boolean;
}

interface TerminalState {
  quickCommands: TerminalQuickCommand[];
  envInfo: TerminalEnvInfo | null;
  commandHistory: string[];
  loaded: boolean;
  /** Per-tab session info, keyed by tab id (without generation suffix). */
  sessions: Record<string, TerminalSessionInfo>;
  /** Maps tab id → full session id (with generation) for IPC calls. */
  sessionIds: Record<string, string>;

  loadFromProject: (projectRoot: string) => Promise<void>;
  fetchEnvInfo: () => Promise<void>;

  registerSession: (tabId: string, sessionId: string, info: TerminalSessionInfo) => void;
  removeSession: (tabId: string) => void;
  setBusy: (tabId: string, busy: boolean) => void;

  addQuickCommand: (label: string, command: string, description?: string) => Promise<void>;
  updateQuickCommand: (id: string, patch: Partial<Pick<TerminalQuickCommand, "label" | "command" | "description">>) => void;
  removeQuickCommand: (id: string) => Promise<void>;
  reorderQuickCommands: (commands: TerminalQuickCommand[]) => Promise<void>;

  addToHistory: (command: string) => void;
  clearHistory: () => void;
}

// ─── Helpers ───

function getProjectRoot(): string | null {
  return useDocumentStore.getState().projectRoot;
}

async function persist(commands: TerminalQuickCommand[]): Promise<void> {
  const root = getProjectRoot();
  if (root) {
    await window.electronAPI.terminalSaveConfig(root, { quickCommands: commands });
  }
}

// ─── Store ───

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  quickCommands: [],
  envInfo: null,
  commandHistory: [],
  loaded: false,
  sessions: {},
  sessionIds: {},

  loadFromProject: async (projectRoot: string) => {
    if (!projectRoot) return;
    try {
      const config = await window.electronAPI.terminalLoadConfig(projectRoot);
      set({ quickCommands: config.quickCommands ?? [], loaded: true });
    } catch {
      set({ quickCommands: [], loaded: true });
    }
  },

  fetchEnvInfo: async () => {
    try {
      const info = await window.electronAPI.terminalEnvInfo();
      set({ envInfo: info });
    } catch {
      // env info is non-critical — ignore errors
    }
  },

  registerSession: (tabId: string, sessionId: string, info: TerminalSessionInfo) => {
    set((s) => ({
      sessions: { ...s.sessions, [tabId]: { ...info, busy: false } },
      sessionIds: { ...s.sessionIds, [tabId]: sessionId },
    }));
  },

  setBusy: (tabId: string, busy: boolean) => {
    set((s) => {
      const existing = s.sessions[tabId];
      if (!existing) return {};
      return {
        sessions: { ...s.sessions, [tabId]: { ...existing, busy } },
      };
    });
  },

  removeSession: (tabId: string) => {
    set((s) => {
      const next = { ...s.sessions };
      delete next[tabId];
      const nextIds = { ...s.sessionIds };
      delete nextIds[tabId];
      return { sessions: next, sessionIds: nextIds };
    });
  },

  addQuickCommand: async (label: string, command: string, description?: string) => {
    const { quickCommands } = get();
    const newCommand: TerminalQuickCommand = {
      id: `tqc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      command,
      description,
      order: quickCommands.length,
      createdAt: Date.now(),
    };
    const updated = [...quickCommands, newCommand];
    set({ quickCommands: updated });
    await persist(updated);
  },

  updateQuickCommand: (id: string, patch) => {
    const updated = get().quickCommands.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    );
    set({ quickCommands: updated });
    persist(updated);
  },

  removeQuickCommand: async (id: string) => {
    const updated = get().quickCommands.filter((c) => c.id !== id);
    set({ quickCommands: updated });
    await persist(updated);
  },

  reorderQuickCommands: async (commands: TerminalQuickCommand[]) => {
    set({ quickCommands: commands });
    await persist(commands);
  },

  addToHistory: (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    const { commandHistory } = get();
    const filtered = commandHistory.filter((c) => c !== trimmed);
    const updated = [trimmed, ...filtered].slice(0, 100);
    set({ commandHistory: updated });
  },

  clearHistory: () => {
    set({ commandHistory: [] });
  },
}));
