import { create } from "zustand";
import { createLogger } from "@/services/logger";
import type { WorkspaceFolder } from "@/types/workspace";
import {
  DEFAULT_PERMISSION_MODE,
  type PermissionMode,
} from "@shared/permission-modes";

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
  /** @deprecated Use lastActiveFileIdByProject */
  lastActiveFileId?: string | null;
  /** Recently opened files per project root */
  recentOpenedFilesByProject?: Record<string, Array<{ id: string; name: string; lastOpened: number }>>;
  /** Last opened file per project root */
  lastActiveFileIdByProject?: Record<string, string | null>;
  /** @deprecated Global list — do not read; use recentOpenedFilesByProject */
  recentOpenedFiles?: Array<{ id: string; name: string; lastOpened: number }>;
  /** Auto-create main.tex template on new project creation */
  autoCreateMainTex?: boolean;
  /** Default document class for main.tex template */
  defaultDocClass?: "article" | "report" | "book";
  /** Custom system prompt for the agent shell. Empty = use built-in default. */
  agentSystemPrompt?: string;
  /** Selected AI provider */
  aiProvider?: string;
  /** Selected AI model (null = provider default) */
  aiModel?: string | null;
  /** AI provider API keys (provider → key mapping) */
  aiApiKeys?: Record<string, string>;
  /** AI provider base URLs (provider → url mapping) */
  aiBaseUrls?: Record<string, string>;
  /** Selected editor syntax highlighting theme */
  editorSyntaxTheme?: string;
  /** Default workspace folder configuration for new projects */
  defaultWorkspaceDirs?: WorkspaceFolder[];
  /** AI reasoning/thinking depth level. Per-provider values: low/medium/high/max/minimal/xhigh.
   *  undefined = provider default. */
  thoughtLevel?: string;
  /** User-added custom model IDs per provider */
  aiCustomModels?: Record<string, string[]>;
  /** User-added custom model configs per provider (structured, with name + context window) */
  aiCustomModelsData?: Record<string, { id: string; name: string; contextWindow: string }[]>;
  /** Enabled model IDs per provider (checked = shown in chat model dropdown) */
  aiEnabledModels?: Record<string, string[]>;
  /** Per-model reasoning depth: key = `providerId/modelId` */
  aiModelThoughtLevels?: Record<string, string>;
  /** Providers whose API keys have been verified */
  aiVerifiedProviders?: string[];
  /** Chat tool permission preset: ask | auto | readonly */
  permissionMode?: PermissionMode;
  /** Agent shell execution: mirror (OpenCode bash + UI mirror) | pty (custom bash tool) */
  agentTerminalMode?: "mirror" | "pty";
  /** Auto-open AI terminal tab when agent runs bash (default true). */
  aiTerminalAutoOpen?: boolean;
  /** Ms to keep AI terminal tab after command exits (default 60s). */
  aiTerminalPostExitGraceMs?: number;
  /** Ms of session inactivity before GC closes idle AI tab (default 10 min). */
  aiTerminalIdleCloseMs?: number;
  /** Closing AI terminal tab while running also cancels the command (default false). */
  aiTerminalCloseTabKillsProcess?: boolean;
  /** Show AI terminal status in session title hover card (default true). */
  aiTerminalShowSessionIndicator?: boolean;
  /** User-added custom API providers */
  aiCustomProviders?: { id: string; name: string; baseUrl: string }[];
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
  permissionMode: DEFAULT_PERMISSION_MODE,
  agentTerminalMode: "pty",
  aiTerminalAutoOpen: true,
  aiTerminalPostExitGraceMs: 60_000,
  aiTerminalIdleCloseMs: 600_000,
  aiTerminalCloseTabKillsProcess: false,
  aiTerminalShowSessionIndicator: true,
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

      // Migrate: aiCustomModels (string[]) → aiCustomModelsData (structured)
      const r = remote as any;
      if (
        r.aiCustomModels &&
        Object.keys(r.aiCustomModels).length > 0 &&
        !r.aiCustomModelsData
      ) {
        const migrated: Record<string, { id: string; name: string; contextWindow: string }[]> = {};
        for (const [providerId, modelIds] of Object.entries(r.aiCustomModels)) {
          migrated[providerId] = (modelIds as string[]).map((id: string) => ({
            id,
            name: id,
            contextWindow: "Unknown",
          }));
        }
        r.aiCustomModelsData = migrated;
        window.electronAPI.settingsSet({ aiCustomModelsData: migrated }).catch(() => {});
        log.info("Migrated aiCustomModels → aiCustomModelsData");
      }

      // Migrate: global recent/lastActive → per-project maps (one-time, keyed by lastProjectPath)
      const legacyProject = typeof r.lastProjectPath === "string" ? r.lastProjectPath : null;
      if (legacyProject) {
        let migratedScoped = false;
        if (r.lastActiveFileId && !r.lastActiveFileIdByProject?.[legacyProject]) {
          r.lastActiveFileIdByProject = {
            ...(r.lastActiveFileIdByProject ?? {}),
            [legacyProject]: r.lastActiveFileId,
          };
          migratedScoped = true;
        }
        if (
          Array.isArray(r.recentOpenedFiles) &&
          r.recentOpenedFiles.length > 0 &&
          !r.recentOpenedFilesByProject?.[legacyProject]
        ) {
          r.recentOpenedFilesByProject = {
            ...(r.recentOpenedFilesByProject ?? {}),
            [legacyProject]: r.recentOpenedFiles,
          };
          migratedScoped = true;
        }
        if (migratedScoped) {
          window.electronAPI
            .settingsSet({
              lastActiveFileIdByProject: r.lastActiveFileIdByProject,
              recentOpenedFilesByProject: r.recentOpenedFilesByProject,
            })
            .catch(() => {});
          log.info("Migrated global recent/lastActive → per-project maps", { legacyProject });
        }
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

    if (patch.permissionMode === "auto") {
      const { useChangesStore } = await import("./changes-store");
      useChangesStore.getState().clearAll();
    }

    try {
      await window.electronAPI.settingsSet(patch);
      log.info("Settings updated", patch);
    } catch (err) {
      log.error("Failed to persist settings", err);
    }
  },
}));
