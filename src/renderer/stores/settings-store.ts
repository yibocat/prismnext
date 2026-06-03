import { create } from "zustand";
import { createLogger } from "@/services/logger";

const log = createLogger("settings-store");

export interface AppSettings {
  theme: "dark" | "light" | "system";
  themeColor?: "teal" | "academic-blue" | "ink-green" | "rose" | "violet" | "amber" | "mono";
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  /** PDF viewer dark mode: off | on | follow (app theme) */
  pdfDarkMode?: "off" | "on" | "follow";
  zoteroApiKey?: string;
  zoteroUserId?: string;
  /** Desktop glass transparency: on/off */
  glassEffect?: boolean;
  /** Glass intensity: 1 (most transparent) to 5 (most solid) */
  glassIntensity?: number;
}

const defaults: AppSettings = {
  theme: "dark",
  themeColor: "academic-blue",
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  glassEffect: false,
  glassIntensity: 3,
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
        settings: {
          ...defaults,
          ...remote,
          theme: (remote.theme as AppSettings["theme"]) || defaults.theme,
        },
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
