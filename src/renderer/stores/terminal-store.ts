import { create } from "zustand";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { shellDisplayName, isGenericTerminalTabTitle } from "@/lib/terminal/shell-label";
import { terminalTabLabelFromCommand } from "@/lib/terminal/root";
import type {
  TerminalQuickCommand,
  TerminalEnvInfo,
  TerminalSessionInfo,
  TerminalProcessStatus,
  TerminalCommandBlock,
} from "@/types/terminal";

// ─── Types ───

interface TerminalState {
  quickCommands: TerminalQuickCommand[];
  envInfo: TerminalEnvInfo | null;
  loaded: boolean;
  /** Per-tab session info, keyed by tab id. */
  sessions: Record<string, TerminalSessionInfo>;
  /** Incremented to trigger TerminalView respawn after exit. */
  restartNonce: Record<string, number>;

  loadFromProject: (projectRoot: string) => Promise<void>;
  fetchEnvInfo: () => Promise<void>;

  markSessionStarting: (tabId: string, sessionId: string) => void;
  registerSession: (
    tabId: string,
    sessionId: string,
    info: Omit<TerminalSessionInfo, "tabId" | "sessionId" | "status" | "startedAt" | "busy">,
  ) => void;
  markSessionExited: (tabId: string, exitCode: number) => void;
  markSessionKilled: (tabId: string) => void;
  setBusy: (tabId: string, busy: boolean) => void;
  /** User submitted a command (Enter or quick command). */
  markCommandSubmitted: (tabId: string) => void;
  /** Update per-tab last command and sync tab/toolbar label. */
  setSessionCommand: (tabId: string, command: string) => void;
  /** Store last completed command output block (OSC 133). */
  setLastCommandBlock: (tabId: string, block: TerminalCommandBlock) => void;
  removeSession: (tabId: string) => void;
  destroyTab: (tabId: string) => void;
  destroyAllTerminalTabs: (tabIds: string[]) => void;
  resetProjectState: () => void;
  requestRestart: (tabId: string) => void;

  addQuickCommand: (label: string, command: string, description?: string) => Promise<void>;
  updateQuickCommand: (id: string, patch: Partial<Pick<TerminalQuickCommand, "label" | "command" | "description">>) => void;
  removeQuickCommand: (id: string) => Promise<void>;
  reorderQuickCommands: (commands: TerminalQuickCommand[]) => Promise<void>;

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
  loaded: false,
  sessions: {},
  restartNonce: {},

  loadFromProject: async (projectRoot: string) => {
    if (!projectRoot) return;
    try {
      const config = await window.electronAPI.terminalLoadConfig(projectRoot);
      if (useDocumentStore.getState().projectRoot !== projectRoot) return;
      set({
        quickCommands: config.quickCommands ?? [],
        loaded: true,
        sessions: {},
        envInfo: null,
        restartNonce: {},
      });
    } catch {
      if (useDocumentStore.getState().projectRoot !== projectRoot) return;
      set({
        quickCommands: [],
        loaded: true,
        sessions: {},
        envInfo: null,
        restartNonce: {},
      });
    }
  },

  fetchEnvInfo: async () => {
    try {
      const info = await window.electronAPI.terminalEnvInfo();
      set({ envInfo: info });
      const label = shellDisplayName(info.shell);
      for (const tab of useRightPanelStore.getState().tabs) {
        if (
          tab.kind === "terminal"
          && tab.terminalSource !== "ai"
          && isGenericTerminalTabTitle(tab.title)
        ) {
          useRightPanelStore.getState().updateTerminalTabTitle(tab.id, label);
        }
      }
    } catch {
      // env info is non-critical — ignore errors
    }
  },

  markSessionStarting: (tabId: string, sessionId: string) => {
    set((s) => ({
      sessions: {
        ...s.sessions,
        [tabId]: {
          tabId,
          sessionId,
          shell: "",
          cwd: "",
          pid: 0,
          status: "starting",
          busy: false,
          startedAt: Date.now(),
        },
      },
    }));
  },

  registerSession: (tabId, sessionId, info) => {
    set((s) => ({
      sessions: {
        ...s.sessions,
        [tabId]: {
          tabId,
          sessionId,
          ...info,
          status: "running" as TerminalProcessStatus,
          busy: false,
          startedAt: s.sessions[tabId]?.startedAt ?? Date.now(),
        },
      },
    }));
    const tab = useRightPanelStore.getState().tabs.find((t) => t.id === tabId);
    if (tab && isGenericTerminalTabTitle(tab.title)) {
      useRightPanelStore.getState().updateTerminalTabTitle(tabId, shellDisplayName(info.shell));
    }
  },

  markSessionExited: (tabId, exitCode) => {
    set((s) => {
      const existing = s.sessions[tabId];
      if (!existing) return {};
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            ...existing,
            status: "exited",
            exitCode,
            busy: false,
            endedAt: Date.now(),
          },
        },
      };
    });
  },

  markSessionKilled: (tabId) => {
    set((s) => {
      const existing = s.sessions[tabId];
      if (!existing) return {};
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            ...existing,
            status: "killed",
            busy: false,
            endedAt: Date.now(),
          },
        },
      };
    });
  },

  setBusy: (tabId, busy) => {
    set((s) => {
      const existing = s.sessions[tabId];
      if (!existing || existing.busy === busy) return {};
      return {
        sessions: {
          ...s.sessions,
          [tabId]: { ...existing, busy },
        },
      };
    });
  },

  markCommandSubmitted: (tabId) => {
    get().setBusy(tabId, true);
  },

  setSessionCommand: (tabId, command) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    set((s) => {
      const existing = s.sessions[tabId];
      if (!existing) return {};
      return {
        sessions: {
          ...s.sessions,
          [tabId]: { ...existing, lastCommand: trimmed },
        },
      };
    });
    useRightPanelStore.getState().updateTerminalTabTitle(
      tabId,
      terminalTabLabelFromCommand(trimmed),
    );
  },

  setLastCommandBlock: (tabId, block) => {
    set((s) => {
      const existing = s.sessions[tabId];
      if (!existing) return {};
      return {
        sessions: {
          ...s.sessions,
          [tabId]: { ...existing, lastCommandBlock: block },
        },
      };
    });
  },

  removeSession: (tabId) => {
    set((s) => {
      const next = { ...s.sessions };
      delete next[tabId];
      return { sessions: next };
    });
  },

  destroyTab: (tabId) => {
    window.electronAPI.terminalDestroyTab({ tabId });
    get().markSessionKilled(tabId);
    get().removeSession(tabId);
  },

  destroyAllTerminalTabs: (tabIds) => {
    if (tabIds.length === 0) return;
    window.electronAPI.terminalDestroyTabs({ tabIds });
    for (const tabId of tabIds) {
      get().markSessionKilled(tabId);
      get().removeSession(tabId);
    }
  },

  resetProjectState: () => {
    set({
      sessions: {},
      envInfo: null,
      loaded: false,
      quickCommands: [],
      restartNonce: {},
    });
  },

  requestRestart: (tabId) => {
    // Kill the live PTY first — TerminalView unmount no longer destroys it.
    window.electronAPI.terminalDestroyTab({ tabId });
    get().removeSession(tabId);
    set((s) => ({
      restartNonce: {
        ...s.restartNonce,
        [tabId]: (s.restartNonce[tabId] ?? 0) + 1,
      },
    }));
  },

  addQuickCommand: async (label, command, description) => {
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

  updateQuickCommand: (id, patch) => {
    const updated = get().quickCommands.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    );
    set({ quickCommands: updated });
    persist(updated);
  },

  removeQuickCommand: async (id) => {
    const updated = get().quickCommands.filter((c) => c.id !== id);
    set({ quickCommands: updated });
    await persist(updated);
  },

  reorderQuickCommands: async (commands) => {
    set({ quickCommands: commands });
    await persist(commands);
  },

}));

// Re-export types for consumers
export type { TerminalSessionInfo, TerminalProcessStatus } from "@/types/terminal";
