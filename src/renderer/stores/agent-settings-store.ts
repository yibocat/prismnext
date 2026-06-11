import { create } from "zustand";

export type AgentSettings = Record<string, string | null>;

interface AgentSettingsState {
  /** Per-agent settings, keyed by agent ID */
  settings: Record<string, AgentSettings>;
  setSetting: (agentId: string, key: string, value: string | null) => void;
  /** Get a single setting value for an agent */
  getSetting: (agentId: string, key: string) => string | null;
  /** Get all settings for an agent */
  getAgentSettings: (agentId: string) => AgentSettings;
}

const DEFAULTS: Record<string, AgentSettings> = {
  claude: {
    model: null,
    agentMode: "edit-before-ask",
    effort: "medium",
  },
  gemini: {},
  opencode: {},
  qoder: {},
};

export const useAgentSettingsStore = create<AgentSettingsState>()((set, get) => ({
  settings: structuredClone(DEFAULTS),

  setSetting: (agentId, key, value) =>
    set((s) => ({
      settings: {
        ...s.settings,
        [agentId]: { ...(s.settings[agentId] ?? {}), [key]: value },
      },
    })),

  getSetting: (agentId, key) => get().settings[agentId]?.[key] ?? null,

  getAgentSettings: (agentId) => get().settings[agentId] ?? {},
}));
