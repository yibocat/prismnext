import { create } from "zustand";
import { createLogger } from "@/services/logger";
import type { WorkspaceFolder } from "@/types/workspace";
import {
  DEFAULT_PERMISSION_MODE,
  type PermissionMode,
} from "@shared/permissions/modes";
import {
  DEFAULT_SEARCH_ENGINE,
  isSearchEngineId,
  type SearchEngineId,
} from "@/lib/browser/search-engines";
import { nextRecentOpenedExperimentsByProject } from "@/lib/experiments/recent";
import type { LiteratureUiPrefs } from "@/lib/literature/library-ui-prefs";
import {
  migrateOpenRouterEnabledModelIds,
  migrateOpenRouterPreferenceKey,
  normalizeOpenRouterModelId,
  OPENROUTER_PROVIDER_ID,
} from "../../shared/providers/openrouter-models";
import {
  migrateGoogleEnabledModelIds,
  migrateGooglePreferenceKey,
  normalizeGoogleModelId,
  GOOGLE_PROVIDER_ID,
} from "../../shared/providers/google-models";
import {
  migrateAnthropicEnabledModelIds,
  migrateAnthropicPreferenceKey,
  normalizeAnthropicModelId,
  ANTHROPIC_PROVIDER_ID,
} from "../../shared/providers/anthropic-models";
import { migrateLegacyBuiltinProviders } from "../../shared/providers/lazy-catalog";
import { getModelEffortFallbackIds, getPreset } from "@/lib/providers";
import { prefetchPiModelsCatalog } from "@/lib/providers/pi-model-catalog";
import { parseModelPreferenceKey } from "@/lib/providers/model-keys";
import type { ModelConfig } from "@/lib/providers";
import type { LogLevel } from "@shared/platform/log-types";
import { settingsDesktop } from "@/lib/desktop-api/settings";
import { agentDesktop } from "@/lib/desktop-api/agent";

const log = createLogger("settings-store");

function migrateModelPreferenceKey(key: string): string {
  let next = migrateOpenRouterPreferenceKey(key);
  next = migrateGooglePreferenceKey(next);
  next = migrateAnthropicPreferenceKey(next);
  return next;
}

async function sanitizePersistedModelThoughtLevels(
  levels: Record<string, string> | undefined,
  customModels?: AppSettings["aiCustomModelsData"],
  customProviders?: AppSettings["aiCustomProviders"],
): Promise<Record<string, string> | undefined> {
  if (!levels || Object.keys(levels).length === 0) return levels;

  const next: Record<string, string> = { ...levels };
  let changed = false;

  for (const [key, effort] of Object.entries(levels)) {
    const parsed = parseModelPreferenceKey(key);
    if (!parsed) {
      delete next[key];
      changed = true;
      continue;
    }
    const fallback = getModelEffortFallbackIds(
      parsed.providerId,
      parsed.modelId,
      customModels,
      customProviders,
    );
    try {
      const result = await agentDesktop.agentGetModelEffort({
        provider: parsed.providerId,
        modelId: parsed.modelId,
        fallback,
      });
      const allowed = result.efforts ?? [];
      if (!allowed.length || !allowed.includes(effort)) {
        delete next[key];
        changed = true;
      }
    } catch {
      if (!fallback?.includes(effort)) {
        delete next[key];
        changed = true;
      }
    }
  }

  return changed ? next : levels;
}

export interface AppSettings {
  theme: "dark" | "light" | "system";
  /** UI language: en | zh-CN | zh-HK (not AI reply language). */
  appLocale?: "en" | "zh-CN" | "zh-HK";
  /** OS desktop notifications when the window is in the background. */
  desktopNotifications?: boolean;
  /** Show Tray (menu bar / system tray) and hide-on-close while enabled. */
  trayIconEnabled?: boolean;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  /** PDF viewer dark mode: off | on | follow (app theme) */
  pdfDarkMode?: "off" | "on" | "follow";
  zoteroApiKey?: string;
  zoteroUserId?: string;
  zoteroLastBBTDetected?: boolean;
  defaultProjectId?: string;
  workbenchProjectIds?: string[];
  /** @deprecated Use lastActiveFileIdByProject */
  lastActiveFileId?: string | null;
  /** Recently opened files per project root */
  recentOpenedFilesByProject?: Record<string, Array<{ id: string; name: string; lastOpened: number }>>;
  /** Recently opened experiments per project root */
  recentOpenedExperimentsByProject?: Record<
    string,
    Array<{ id: string; name: string; lastOpened: number }>
  >;
  /** Last opened file per project root */
  lastActiveFileIdByProject?: Record<string, string | null>;
  /** Project + chat tabs to reopen on the next launch. */
  lastFocusProjectId?: string | null;
  lastFocusConversationId?: string | null;
  lastOpenConversationIds?: string[];
  lastSessionProjectIds?: Record<string, string>;
  /** Archived chat session ids per project root */
  archivedSessionIdsByProject?: Record<string, string[]>;
  /** Pinned chat session ids per project root */
  pinnedSessionIdsByProject?: Record<string, string[]>;
  /** Literature library sidebar view + list sort per project root */
  literatureUiByProject?: Record<string, LiteratureUiPrefs>;
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
  /**
   * User shortcut overrides keyed by ShortcutDef.id.
   * Only applied when the definition is remappable (workspace/product).
   */
  shortcutOverrides?: Record<string, import("../../shared/shortcuts").ShortcutChord>;
  /** Selected editor syntax highlighting theme */
  editorSyntaxTheme?: string;
  /** Default workspace folder configuration for new projects */
  defaultWorkspaceDirs?: WorkspaceFolder[];
  /** When creating a new project, initialize a git repo by default (default true). */
  defaultInitGit?: boolean;
  /** AI reasoning/thinking depth level. Per-provider values: low/medium/high/max/minimal/xhigh.
   *  undefined = provider default. */
  thoughtLevel?: string;
  /** User-added custom model IDs per provider */
  aiCustomModels?: Record<string, string[]>;
  /** User-added custom model configs per provider (structured, with name + context window) */
  aiCustomModelsData?: Record<string, { id: string; name: string; contextWindow: string; capabilities?: { vision?: boolean } }[]>;
  /** Enabled model IDs per provider (checked = shown in chat model dropdown) */
  aiEnabledModels?: Record<string, string[]>;
  /** Optional helper model used to describe images for text-only main models. */
  aiVisionFallbackModel?: string | null;
  /** Optional default model for Task / subagents (`provider/model`). */
  aiSubagentModel?: string | null;
  /** Per-model reasoning depth: key = `providerId/modelId` */
  aiModelThoughtLevels?: Record<string, string>;
  /** Pinned model keys (`providerId/modelId`) — shown at top of chat model picker. */
  aiPinnedModelKeys?: string[];
  /** Hidden left-nav primary ids (New Chat cannot be hidden). */
  leftNavHiddenIds?: string[];
  /** Left-nav primary id order. Required items stay first. */
  leftNavOrder?: string[];
  /** Providers whose API keys have been verified */
  aiVerifiedProviders?: string[];
  /** Chat tool permission preset: ask | edit_auto | auto | readonly */
  permissionMode?: PermissionMode;
  /**
   * Experimental: paint production chat text from AgentEvent instead of
   * OpenCode `message.part.updated`. Default off — appearance unchanged.
   * Testers set this in the settings JSON (no Settings UI).
   */
  agentEventUi?: boolean;
  /** Tools pinned via permission-gate "Always" (lowercased names). */
  toolAllowAlways?: string[];
  /** Bash command patterns from "Always" (e.g. `git status*`). */
  bashAllowAlwaysPatterns?: string[];
  /** Extra allowed absolute paths for permission policy. */
  permissionAllowedPaths?: string[];
  /** Stored allow rule lines (`ToolName(pattern)`). */
  permissionAllowRules?: string[];
  /** Stored deny rule lines (`ToolName(pattern)`). */
  permissionDenyRules?: string[];
  /** Permission mode schema version (migration). */
  permissionModeSchemaVersion?: number;
  /** Minimum level written by the main-process logger. Default info. */
  logMinLevel?: LogLevel;
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
  /** Auto-open Job Monitor when an agent/experiment job starts. */
  jobMonitorAutoOpen?: boolean;
  /** Closing a Job Monitor also cancels that execution. */
  jobMonitorCloseCancels?: boolean;
  /** Ms to keep a finished job visible before idle cleanup. */
  jobMonitorKeepFinishedMs?: number;
  /** Ms of inactivity before an unpinned finished monitor is closed. */
  jobMonitorIdleCloseMs?: number;
  /** User-added custom API providers */
  aiCustomProviders?: { id: string; name: string; baseUrl: string }[];
  /**
   * One-shot: former built-ins (openai/google/deepseek) were promoted into
   * `aiCustomProviders`. Once set, never re-promote — user remove must stick.
   */
  legacyBuiltinProvidersMigrated?: boolean;
  /** MinerU cloud API token for precision PDF extraction */
  mineruApiToken?: string;
  /** Optional Semantic Scholar API key for literature-discover rate limits */
  semanticScholarApiKey?: string;
  /** Optional NCBI API key for PubMed literature-discover rate limits */
  pubmedApiKey?: string;
  /** Default extract engine: pdfjs (local) | mineru (cloud) */
  literatureExtractEngineDefault?: "pdfjs" | "mineru";
  /** Auto-extract PDF on library import (default off) */
  literatureAutoExtractOnImport?: boolean;
  /** When true (default), literature-read-pdf only works for intensive-reading papers. */
  literatureStrictIntensivePdf?: boolean;
  /** After PDF extract, auto-generate AI summary + keywords (uses tokens). */
  literatureAutoAiMetadata?: boolean;
  literatureAiMetadataModel?: string;

  /** Update-check source — local file path or HTTPS url to version.json. */
  updateSource?: string;
  /** A version the user dismissed; suppressed from "available" until unignored. */
  ignoredUpdateVersion?: string;
  /** Background-download updates after check (default true). Install still needs a click / quit. */
  autoDownloadUpdates?: boolean;
  /** Chat message + composer width tier. narrow 42rem | balanced 48rem (default) | wide 64rem. */
  messageWidth?: "narrow" | "balanced" | "wide";
  /** Empty chat homepage decorative backdrop (auto follows theme pack). */
  chatHomeBackdrop?:
    | "auto"
    | "none"
    | "academic"
    | "origami"
    | "rain"
    | "forest"
    | "blueprint"
    | "starfield"
    | "circuit"
    | "bookshelf"
    | "ink"
    | "clips"
    | "paperplane"
    | "stamp"
    | "pendulum"
    | "constellation";
  /** Master toggle for chat homepage backdrop. Default on. */
  chatHomeBackdropEnabled?: boolean;
  /** Default search engine for the in-app browser address bar. */
  searchEngine?: SearchEngineId;
  /** Persisted theme generator / pack config. */
  _themeConfig?: Record<string, unknown>;
  /** One-shot: legacy themeColor migrated into `_themeConfig`. */
  _themePackMigrated?: boolean;
  /** @deprecated Legacy primary color; migrated into theme packs. */
  themeColor?: string;
}

const defaults: AppSettings = {
  theme: "dark",
  appLocale: "en",
  desktopNotifications: true,
  trayIconEnabled: true,
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  autoCreateMainTex: true,
  defaultDocClass: "article",
  agentSystemPrompt: "",
  editorSyntaxTheme: "prism",
  defaultWorkspaceDirs: [
    { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
    { function: "notebook", name: "notes" },
  ],
  defaultInitGit: true,
  permissionMode: DEFAULT_PERMISSION_MODE,
  agentTerminalMode: "pty",
  aiTerminalAutoOpen: true,
  aiTerminalPostExitGraceMs: 60_000,
  aiTerminalIdleCloseMs: 600_000,
  aiTerminalCloseTabKillsProcess: false,
  messageWidth: "balanced",
  chatHomeBackdrop: "auto",
  chatHomeBackdropEnabled: true,
  searchEngine: DEFAULT_SEARCH_ENGINE,
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  trackRecentOpenedExperiment: (projectRoot: string, id: string, name: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: { ...defaults },
  loaded: false,

  loadSettings: async () => {
    const t0 = performance.now();
    try {
      const remote = await settingsDesktop.settingsGet();

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
        settingsDesktop.settingsSet({ defaultWorkspaceDirs: remote.defaultWorkspaceDirs }).catch(() => {});
        log.info("Migrated manuscriptDir → defaultWorkspaceDirs", { from: migratedDir });
      }

      // Migrate: aiCustomModels (string[]) → aiCustomModelsData (structured)
      const r = remote as any;

      // ── OpenCode → Pi provider id migration (one-shot) ────────────────────
      // Legacy product provider ids (opencode-zen, zhipu, kimi, alibaba, minimax)
      // become their Pi equivalents. Every settings key that names a provider
      // (or a `provider/model` key) must be rebased.
      {
        const { LEGACY_PROVIDER_ID_MAP } = await import("../../shared/providers/pi-catalog");
        const legacyIds = Object.keys(LEGACY_PROVIDER_ID_MAP);
        if (legacyIds.length > 0) {
          let changed = false;
          const rebaseKey = (key: string, legacyId: string): string => {
            const prefix = `${legacyId}/`;
            if (!key.startsWith(prefix)) return key;
            return `${LEGACY_PROVIDER_ID_MAP[legacyId]}/${key.slice(prefix.length)}`;
          };
          const rebaseMapKeys = (
            map: Record<string, unknown> | undefined,
            rebase: (k: string) => string,
          ): Record<string, unknown> | undefined => {
            if (!map) return map;
            let next = map;
            for (const key of Object.keys(map)) {
              const rebased = rebase(key);
              if (rebased === key) continue;
              if (!changed) changed = true;
              next = { ...next };
              next[rebased] = next[key];
              delete next[key];
            }
            return next;
          };

          // aiProvider / aiModel — the active selection itself.
          if (typeof r.aiProvider === "string" && legacyIds.includes(r.aiProvider)) {
            r.aiProvider = LEGACY_PROVIDER_ID_MAP[r.aiProvider];
            changed = true;
          }

          // aiCustomProviders (id) / aiApiKeys / aiBaseUrls / aiEnabledModels /
          // aiCustomModelsData / aiCustomModels — keyed by provider id.
          if (Array.isArray(r.aiCustomProviders)) {
            for (const cp of r.aiCustomProviders) {
              if (cp && typeof cp.id === "string" && legacyIds.includes(cp.id)) {
                cp.id = LEGACY_PROVIDER_ID_MAP[cp.id];
                changed = true;
              }
            }
          }
          r.aiApiKeys = rebaseMapKeys(r.aiApiKeys, (k) =>
            legacyIds.includes(k) ? LEGACY_PROVIDER_ID_MAP[k] : k,
          ) as Record<string, string> | undefined;
          r.aiBaseUrls = rebaseMapKeys(r.aiBaseUrls, (k) =>
            legacyIds.includes(k) ? LEGACY_PROVIDER_ID_MAP[k] : k,
          ) as Record<string, string> | undefined;
          r.aiEnabledModels = rebaseMapKeys(r.aiEnabledModels, (k) =>
            legacyIds.includes(k) ? LEGACY_PROVIDER_ID_MAP[k] : k,
          ) as Record<string, string[]> | undefined;
          r.aiCustomModelsData = rebaseMapKeys(r.aiCustomModelsData, (k) =>
            legacyIds.includes(k) ? LEGACY_PROVIDER_ID_MAP[k] : k,
          ) as Record<string, unknown[]> | undefined;
          r.aiCustomModels = rebaseMapKeys(r.aiCustomModels, (k) =>
            legacyIds.includes(k) ? LEGACY_PROVIDER_ID_MAP[k] : k,
          ) as Record<string, string[]> | undefined;
          if (Array.isArray(r.aiVerifiedProviders)) {
            r.aiVerifiedProviders = r.aiVerifiedProviders.map((id: string) =>
              legacyIds.includes(id) ? LEGACY_PROVIDER_ID_MAP[id] : id,
            );
          }

          // Per-model preference keys `provider/modelId` and `provider/modelId/effort`.
          if (r.aiPinnedModelKeys) {
            let next = r.aiPinnedModelKeys;
            for (const legacyId of legacyIds) {
              next = next.map((k: string) => rebaseKey(k, legacyId));
            }
            r.aiPinnedModelKeys = next;
            changed = true;
          }
          if (r.aiModelThoughtLevels) {
            let next = r.aiModelThoughtLevels;
            let levelsChanged = false;
            for (const legacyId of legacyIds) {
              for (const key of Object.keys(next)) {
                const rebased = rebaseKey(key, legacyId);
                if (rebased === key) continue;
                levelsChanged = true;
                next = { ...next, [rebased]: next[key] };
                delete next[key];
              }
            }
            if (levelsChanged) {
              r.aiModelThoughtLevels = next;
              changed = true;
            }
          }
          // Vision / subagent helper refs `provider/modelId`.
          if (typeof r.aiVisionFallbackModel === "string") {
            for (const legacyId of legacyIds) {
              const prefix = `${legacyId}/`;
              if (r.aiVisionFallbackModel.startsWith(prefix)) {
                r.aiVisionFallbackModel = `${LEGACY_PROVIDER_ID_MAP[legacyId]}/${r.aiVisionFallbackModel.slice(prefix.length)}`;
                changed = true;
              }
            }
          }
          if (typeof r.aiSubagentModel === "string") {
            for (const legacyId of legacyIds) {
              const prefix = `${legacyId}/`;
              if (r.aiSubagentModel.startsWith(prefix)) {
                r.aiSubagentModel = `${LEGACY_PROVIDER_ID_MAP[legacyId]}/${r.aiSubagentModel.slice(prefix.length)}`;
                changed = true;
              }
            }
          }

          if (changed) {
            settingsDesktop
              .settingsSet({
                aiProvider: r.aiProvider,
                aiApiKeys: r.aiApiKeys,
                aiBaseUrls: r.aiBaseUrls,
                aiEnabledModels: r.aiEnabledModels,
                aiCustomModelsData: r.aiCustomModelsData,
                aiCustomModels: r.aiCustomModels,
                aiCustomProviders: r.aiCustomProviders,
                aiVerifiedProviders: r.aiVerifiedProviders,
                aiPinnedModelKeys: r.aiPinnedModelKeys,
                aiModelThoughtLevels: r.aiModelThoughtLevels,
                aiVisionFallbackModel: r.aiVisionFallbackModel,
                aiSubagentModel: r.aiSubagentModel,
              })
              .catch(() => {});
            log.info("Migrated legacy provider ids to Pi ids", {
              map: LEGACY_PROVIDER_ID_MAP,
            });
          }
        }
      }
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
            capabilities: { vision: false },
          }));
        }
        r.aiCustomModelsData = migrated;
        settingsDesktop.settingsSet({ aiCustomModelsData: migrated }).catch(() => {});
        log.info("Migrated aiCustomModels → aiCustomModelsData");
      }

      for (const catalogId of ["opencode-go"] as const) {
        if (r.aiEnabledModels?.[catalogId]) {
          const raw = r.aiEnabledModels[catalogId] as string[];
          const migrated = raw.map((id: string) => id.trim().toLowerCase());
          const changed =
            migrated.length !== raw.length || migrated.some((id, i) => id !== raw[i]);
          if (changed) {
            r.aiEnabledModels = { ...r.aiEnabledModels, [catalogId]: migrated };
            settingsDesktop
              .settingsSet({ aiEnabledModels: r.aiEnabledModels })
              .catch(() => {});
            log.info(`Migrated ${catalogId} aiEnabledModels to canonical IDs`);
          }
        }
        if (r.aiProvider === catalogId && typeof r.aiModel === "string") {
          const normalized = r.aiModel.trim().toLowerCase();
          if (normalized !== r.aiModel) {
            const previous = r.aiModel;
            r.aiModel = normalized;
            settingsDesktop.settingsSet({ aiModel: normalized }).catch(() => {});
            log.info(`Migrated aiModel to canonical ${catalogId} id`, {
              from: previous,
              to: normalized,
            });
          }
        }
      }

      // Former built-ins → aiCustomProviders (one-shot; never undo a user remove)
      {
        const migrated = migrateLegacyBuiltinProviders(
          {
            aiCustomProviders: r.aiCustomProviders,
            aiApiKeys: r.aiApiKeys,
            aiBaseUrls: r.aiBaseUrls,
            legacyBuiltinProvidersMigrated: r.legacyBuiltinProvidersMigrated,
          },
          (id) => {
            const preset = getPreset(id);
            return preset
              ? { name: preset.name, defaultBaseUrl: preset.defaultBaseUrl }
              : undefined;
          },
        );
        if (migrated) {
          r.aiCustomProviders = migrated.aiCustomProviders;
          r.legacyBuiltinProvidersMigrated = true;
          settingsDesktop
            .settingsSet({
              aiCustomProviders: migrated.aiCustomProviders,
              legacyBuiltinProvidersMigrated: true,
            })
            .catch(() => {});
          if (migrated.promoted) {
            log.info("Migrated legacy built-in providers into aiCustomProviders", {
              ids: migrated.aiCustomProviders.map((p) => p.id),
            });
          } else {
            log.info("Marked legacy built-in provider migration complete (no promote)");
          }
        }
      }

      // OpenRouter / Google / Anthropic: migrate legacy model IDs
      {
        let providerPatch: Partial<AppSettings> | null = null;

        const migrateEnabled = (
          providerId: string,
          migrateIds: (ids: string[]) => string[],
        ) => {
          if (!r.aiEnabledModels?.[providerId]) return;
          const raw = r.aiEnabledModels[providerId] as string[];
          const migrated = migrateIds(raw);
          const changed =
            migrated.length !== raw.length || migrated.some((id, i) => id !== raw[i]);
          if (!changed) return;
          r.aiEnabledModels = { ...r.aiEnabledModels, [providerId]: migrated };
          providerPatch = {
            ...(providerPatch ?? {}),
            aiEnabledModels: r.aiEnabledModels,
          };
        };

        const migrateCustoms = (
          providerId: string,
          normalizeId: (id: string) => string,
        ) => {
          if (!r.aiCustomModelsData?.[providerId]) return;
          const raw = r.aiCustomModelsData[providerId] as ModelConfig[];
          const migrated = raw.map((m) => {
            const id = normalizeId(m.id);
            return id === m.id ? m : { ...m, id };
          });
          const changed = migrated.some((m, i) => m.id !== raw[i]?.id);
          if (!changed) return;
          r.aiCustomModelsData = {
            ...r.aiCustomModelsData,
            [providerId]: migrated,
          };
          providerPatch = {
            ...(providerPatch ?? {}),
            aiCustomModelsData: r.aiCustomModelsData,
          };
        };

        const migrateActiveModel = (
          providerId: string,
          normalizeId: (id: string) => string,
        ) => {
          if (r.aiProvider !== providerId || typeof r.aiModel !== "string") return;
          const normalized = normalizeId(r.aiModel);
          if (normalized === r.aiModel) return;
          const previous = r.aiModel;
          r.aiModel = normalized;
          providerPatch = { ...(providerPatch ?? {}), aiModel: normalized };
          log.info(`Migrated aiModel to canonical ${providerId} id`, {
            from: previous,
            to: normalized,
          });
        };

        migrateEnabled(OPENROUTER_PROVIDER_ID, migrateOpenRouterEnabledModelIds);
        migrateCustoms(OPENROUTER_PROVIDER_ID, normalizeOpenRouterModelId);
        migrateActiveModel(OPENROUTER_PROVIDER_ID, normalizeOpenRouterModelId);

        migrateEnabled(GOOGLE_PROVIDER_ID, migrateGoogleEnabledModelIds);
        migrateCustoms(GOOGLE_PROVIDER_ID, normalizeGoogleModelId);
        migrateActiveModel(GOOGLE_PROVIDER_ID, normalizeGoogleModelId);

        migrateEnabled(ANTHROPIC_PROVIDER_ID, migrateAnthropicEnabledModelIds);
        migrateCustoms(ANTHROPIC_PROVIDER_ID, normalizeAnthropicModelId);
        migrateActiveModel(ANTHROPIC_PROVIDER_ID, normalizeAnthropicModelId);

        if (r.aiModelThoughtLevels) {
          const nextLevels: Record<string, string> = {};
          let levelsChanged = false;
          for (const [key, value] of Object.entries(r.aiModelThoughtLevels)) {
            const migratedKey = migrateModelPreferenceKey(key);
            if (migratedKey !== key) levelsChanged = true;
            nextLevels[migratedKey] = String(value);
          }
          if (levelsChanged) {
            r.aiModelThoughtLevels = nextLevels;
            providerPatch = {
              ...(providerPatch ?? {}),
              aiModelThoughtLevels: nextLevels,
            };
          }
        }

        if (providerPatch) {
          settingsDesktop.settingsSet(providerPatch).catch(() => {});
          log.info("Migrated provider model IDs to canonical catalog ids");
        }
      }

      set({
        settings: {
          ...defaults,
          ...remote,
          theme: (remote.theme as AppSettings["theme"]) || defaults.theme,
          searchEngine: isSearchEngineId(remote.searchEngine)
            ? remote.searchEngine
            : defaults.searchEngine,
        },
        loaded: true,
      });
      console.log(`[settings] loaded: ${Math.round(performance.now() - t0)}ms`);
      log.info("Settings loaded");

      void sanitizePersistedModelThoughtLevels(
        r.aiModelThoughtLevels,
        r.aiCustomModelsData,
        r.aiCustomProviders,
      ).then((sanitized) => {
        if (!sanitized || sanitized === r.aiModelThoughtLevels) return;
        log.info("Sanitized invalid aiModelThoughtLevels entries");
        void get().updateSettings({ aiModelThoughtLevels: sanitized });
      });

      const hasPiCatalogProvider =
        Boolean(r.aiApiKeys?.["opencode"]?.trim())
        || Boolean(r.aiApiKeys?.["opencode-go"]?.trim())
        || remote.aiCustomProviders?.some(
          (p) => p.id === "opencode" || p.id === "opencode-go",
        );
      if (hasPiCatalogProvider) {
        void prefetchPiModelsCatalog();
      }
    } catch (err) {
      console.log(`[settings] load failed: ${Math.round(performance.now() - t0)}ms`);
      log.error("Failed to load settings", err);
      set({ loaded: true }); // proceed with defaults
    }
  },

  updateSettings: async (patch: Partial<AppSettings>) => {
    const merged = { ...get().settings, ...patch };
    set({ settings: merged });

    if (patch.permissionMode === "auto" || patch.permissionMode === "edit_auto") {
      const { useChangesStore } = await import("./changes-store");
      useChangesStore.getState().clearAll();
    }

    try {
      await settingsDesktop.settingsSet(patch);
      log.info("Settings updated", patch);
    } catch (err) {
      log.error("Failed to persist settings", err);
    }
  },

  trackRecentOpenedExperiment: async (projectRoot, id, name) => {
    if (!projectRoot || !id.trim()) return;
    const map = nextRecentOpenedExperimentsByProject(
      get().settings.recentOpenedExperimentsByProject,
      projectRoot,
      id,
      name,
    );
    await get().updateSettings({ recentOpenedExperimentsByProject: map });
  },
}));
