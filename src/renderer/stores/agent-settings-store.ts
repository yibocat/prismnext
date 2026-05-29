import { create } from "zustand";

interface AgentSettingsState {
  settings: Record<string, string | null>;
  setSetting: (key: string, value: string | null) => void;
  getSetting: (key: string) => string | null;
}

export const useAgentSettingsStore = create<AgentSettingsState>()((set, get) => ({
  settings: {},

  setSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),

  getSetting: (key) => get().settings[key] ?? null,
}));
