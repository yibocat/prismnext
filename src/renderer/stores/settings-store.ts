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
  /** Path to auto-reopen on next launch */
  lastProjectPath?: string | null;
  /** Last opened file — used for smart expand on project open */
  lastActiveFileId?: string | null;
  /** Default manuscript directory name for new projects */
  manuscriptDir?: string;
  /** Auto-create main.tex template on new project creation */
  autoCreateMainTex?: boolean;
  /** Default document class for main.tex template */
  defaultDocClass?: "article" | "report" | "book";
}

const defaults: AppSettings = {
  theme: "dark",
  themeColor: "academic-blue",
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  glassEffect: false,
  glassIntensity: 3,
  manuscriptDir: "manuscript",
  autoCreateMainTex: true,
  defaultDocClass: "article",
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
    const t0 = performance.now();
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
      console.log(`[settings] loaded: ${Math.round(performance.now() - t0)}ms`);
      log.info("Settings loaded");
    } catch (err) {
      console.log(`[settings] load failed: ${Math.round(performance.now() - t0)}ms`);
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
