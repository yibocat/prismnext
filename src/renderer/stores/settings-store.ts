import { create } from "zustand";
import { createLogger } from "@/services/logger";

const log = createLogger("settings-store");

export interface AppSettings {
  aiModel: "default" | "sonnet" | "opus" | "haiku";
  effortLevel: "low" | "medium" | "high";
  theme: "dark" | "light" | "system";
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  zoteroApiKey?: string;
  zoteroUserId?: string;
}

const defaults: AppSettings = {
  aiModel: "default",
  effortLevel: "low",
  theme: "dark",
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: { ...defaults },
  loaded: false,

  loadSettings: async () => {
    try {
      const remote = await window.electronAPI.settingsGet();
      set({
        settings: { ...defaults, ...remote },
        loaded: true,
      });
      log.info("Settings loaded");
    } catch (err) {
      log.error("Failed to load settings", err);
      set({ loaded: true }); // proceed with defaults
    }
  },

  updateSettings: async (patch: Partial<AppSettings>) => {
    const merged = { ...get().settings, ...patch };
    set({ settings: merged });

    try {
      await window.electronAPI.settingsSet(patch);
      log.info("Settings updated", patch);
    } catch (err) {
      log.error("Failed to persist settings", err);
    }
  },
}));
