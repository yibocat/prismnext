import { create } from "zustand";
import { createLogger } from "@/services/logger";
import type { WorkspaceFolder } from "@/types/workspace";

const log = createLogger("settings-store");

export interface AppSettings {
  theme: "dark" | "light" | "system";
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  /** PDF viewer dark mode: off | on | follow (app theme) */
  pdfDarkMode?: "off" | "on" | "follow";
  zoteroApiKey?: string;
  zoteroUserId?: string;
  /** Path to auto-reopen on next launch */
  lastProjectPath?: string | null;
  /** Last opened file — used for smart expand on project open */
  lastActiveFileId?: string | null;
  /** Auto-create main.tex template on new project creation */
  autoCreateMainTex?: boolean;
  /** Default document class for main.tex template */
  defaultDocClass?: "article" | "report" | "book";
  /** Custom system prompt for the agent shell. Empty = use built-in default. */
  agentSystemPrompt?: string;
  /** Selected editor syntax highlighting theme */
  editorSyntaxTheme?: string;
  /** Default workspace folder configuration for new projects */
  defaultWorkspaceDirs?: WorkspaceFolder[];
}

const defaults: AppSettings = {
  theme: "dark",
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  autoCreateMainTex: true,
  defaultDocClass: "article",
  agentSystemPrompt: "",
  editorSyntaxTheme: "prism",
  defaultWorkspaceDirs: [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }],
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

      // Migrate: old manuscriptDir → defaultWorkspaceDirs
      if (
        !remote.defaultWorkspaceDirs &&
        typeof (remote as any).manuscriptDir === "string" &&
        (remote as any).manuscriptDir !== "manuscript"
      ) {
        const migratedDir = (remote as any).manuscriptDir as string;
        remote.defaultWorkspaceDirs = [
          { function: "manuscript", name: migratedDir, mainTex: "main.tex" },
        ];
        // Persist immediately so migration only happens once
        window.electronAPI.settingsSet({ defaultWorkspaceDirs: remote.defaultWorkspaceDirs }).catch(() => {});
        log.info("Migrated manuscriptDir → defaultWorkspaceDirs", { from: migratedDir });
      }

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
