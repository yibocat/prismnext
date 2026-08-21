import Store from "electron-store";
import { safeStorage } from "electron";
import {
  bashAlwaysPatternFromCommand,
  bashCommandMatchesAnyPattern,
} from "../../shared/bash-allow-always";
import {
  migratePermissionModeSetting,
  PERMISSION_MODE_SCHEMA_VERSION,
} from "./permission-modes";
import { createLogger, setLogLevel, shortLogDetail } from "./logger";
import { isLogLevel, type LogLevel } from "./log-types";

const log = createLogger("settings", "general");

export interface AppSettings {
  aiModel: "default" | "sonnet" | "opus" | "haiku";
  theme: "dark" | "light" | "system";
  /**
   * UI language: en | zh-CN | zh-HK.
   * Does not affect AI reply language. Legacy `"system"` is treated as `"en"`.
   */
  appLocale?: "en" | "zh-CN" | "zh-HK";
  /** OS desktop notifications when the window is in the background. */
  desktopNotifications?: boolean;
  /** Show Tray (menu bar / system tray) and hide-on-close while enabled. */
  trayIconEnabled?: boolean;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  lastProjectPath?: string;
  /** Workbench default project role (P3). Not used to auto-open in P1. */
  defaultProjectId?: string;
  /** Projects currently on the workbench (P3/P4). */
  workbenchProjectIds?: string[];
  lastActiveFileId?: string | null;
  zoteroApiKey?: string;
  zoteroUserId?: string;
  /** Last probe saw Better BibTeX on the local Zotero connector. */
  zoteroLastBBTDetected?: boolean;
  /** Custom system prompt — replaces the built-in core persona (Layer 0) when set.
   *  Modules, AGENTS.md, and project rules still append below. */
  agentSystemPrompt?: string;
  /** Experimental: paint production chat text from AgentEvent. Default off. */
  agentEventUi?: boolean;

  /** Prompt module toggle states. { "citations": true, "workspace-folders": true, ... }
   *  Missing keys default to the module's built-in default. */
  promptModules?: Record<string, boolean>;
  /** Prompt layer toggle states (userToggleable layers only).
   *  { "active-modules": true, "agents-md": true, "custom-rules": true } */
  promptLayers?: Record<string, boolean>;

  /**
   * User shortcut overrides keyed by shortcut id.
   * Only applied when the definition is remappable (workspace/product).
   */
  shortcutOverrides?: Record<string, import("../../shared/shortcuts").ShortcutChord>;

  /** Built-in slash command enable/disable states. { "compile": false, ... } */
  builtinCommands?: Record<string, boolean>;

  /** Agent shell: mirror (default) or pty (prismnext bash tool + bridge) */
  agentTerminalMode?: "mirror" | "pty";

  /** Auto-open AI terminal when agent runs bash (default true). */
  aiTerminalAutoOpen?: boolean;
  /** Ms to keep AI terminal tab after command exits. */
  aiTerminalPostExitGraceMs?: number;
  /** Ms of session inactivity before GC closes idle AI tab. */
  aiTerminalIdleCloseMs?: number;
  /** Closing AI terminal tab while running also cancels the command. */
  aiTerminalCloseTabKillsProcess?: boolean;
  jobMonitorAutoOpen?: boolean;
  jobMonitorCloseCancels?: boolean;
  jobMonitorKeepFinishedMs?: number;
  jobMonitorIdleCloseMs?: number;

  /** When true (default), agent PDF body reads require intensive-reading list membership. */
  literatureStrictIntensivePdf?: boolean;
  /** After PDF extract, auto-generate AI summary + keywords (uses tokens). */
  literatureAutoAiMetadata?: boolean;
  /** Optional override model for literature AI metadata (`provider/model`). */
  literatureAiMetadataModel?: string;
  /** Optional Semantic Scholar API key for literature-discover rate limits */
  semanticScholarApiKey?: string;
  /** Optional NCBI API key for PubMed literature-discover rate limits */
  pubmedApiKey?: string;

  /** Optional update feed override (generic provider root, or unpackaged
   *  version.json URL/path). Empty → use PRISM_UPDATER_BASE_URL / baked default. */
  updateSource?: string;
  /** A version the user dismissed; suppressed from "available" until unignored. */
  ignoredUpdateVersion?: string;
  /**
   * When true (default), packaged builds download updates in the background after a check
   * finds a newer version. Install still requires an explicit user action (or quit).
   */
  autoDownloadUpdates?: boolean;
  /** Optional helper model ref (`provider/model`) used for image fallback. */
  aiVisionFallbackModel?: string | null;
  /** Provider API keys keyed by provider id. */
  aiApiKeys?: Record<string, string>;
  /** Provider base URLs keyed by provider id. */
  aiBaseUrls?: Record<string, string>;
  /** User-added custom API providers. */
  aiCustomProviders?: Array<{ id: string; name?: string; baseUrl?: string }>;
  /**
   * Optional default model for Task / subagents (`provider/model`).
   * Applied to OpenCode built-in subagents (explore/general/…) and Prism experts
   * that do not set their own model. Null/unset → inherit parent session model.
   */
  aiSubagentModel?: string | null;

  /**
   * Tools the user pinned to "Allow always" from the permission gate.
   * Lowercased tool names; consulted before prompting (non-bash tools).
   */
  toolAllowAlways?: string[];

  /**
   * Bash / shell command patterns from "Allow always" (e.g. `git status*`).
   * Matched with simple glob against the full command string.
   */
  bashAllowAlwaysPatterns?: string[];

  /** Extra directories where file/shell operations skip confirmation (absolute paths). */
  permissionAllowedPaths?: string[];

  /** Verdent-style allow rules (`ToolName(pattern)` per stored line). */
  permissionAllowRules?: string[];

  /** Verdent-style deny rules (`ToolName(pattern)` per stored line). */
  permissionDenyRules?: string[];

  /**
   * Permission mode schema version. v1 stored `"auto"` as edit-auto semantics;
   * v2 renames that to `edit_auto` and makes `auto` full OpenCode-style auto.
   */
  permissionModeSchemaVersion?: number;

  /** Minimum level written by the main-process logger. Default info. */
  logMinLevel?: LogLevel;

  // Renderer-side dynamic keys
  // the catch-all `raw` loop in getSettings(). Listed here for documentation.
  [key: string]: unknown;
}

/** True when `toolName` is in the persisted allow-always list. */
export function isToolAllowAlways(toolName: string | undefined | null): boolean {
  if (!toolName?.trim()) return false;
  const list = getSettings().toolAllowAlways;
  if (!Array.isArray(list) || list.length === 0) return false;
  const n = toolName.trim().toLowerCase();
  return list.some((t) => typeof t === "string" && t.trim().toLowerCase() === n);
}

/** Persist a tool into the allow-always list (idempotent). */
export function addToolAllowAlways(toolName: string): void {
  const n = toolName.trim().toLowerCase();
  if (!n) return;
  const cur = getSettings().toolAllowAlways;
  const list = Array.isArray(cur) ? cur.map((t) => String(t)) : [];
  if (list.some((t) => t.trim().toLowerCase() === n)) return;
  updateSettings({ toolAllowAlways: [...list, n] });
}

/** Whether a shell command matches a persisted Always pattern. */
export function isBashCommandAllowAlways(command: string | undefined | null): boolean {
  return bashCommandMatchesAnyPattern(command ?? "", getSettings().bashAllowAlwaysPatterns);
}

/** Persist a bash Always pattern derived from a concrete command. */
export function addBashAllowAlwaysFromCommand(command: string): string | null {
  const pattern = bashAlwaysPatternFromCommand(command);
  if (!pattern) return null;
  const cur = getSettings().bashAllowAlwaysPatterns;
  const list = Array.isArray(cur) ? cur.map((t) => String(t)) : [];
  if (list.includes(pattern)) return pattern;
  updateSettings({ bashAllowAlwaysPatterns: [...list, pattern] });
  return pattern;
}

const defaults: AppSettings = {
  aiModel: "default",
  theme: "dark",
  desktopNotifications: true,
  trayIconEnabled: true,
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  agentTerminalMode: "pty",
  agentSystemPrompt: "",
  permissionModeSchemaVersion: PERMISSION_MODE_SCHEMA_VERSION,
  autoDownloadUpdates: true,
  promptModules: {
    "workspace-folders": true,
    "chat-citation-staging": true,
    "literature-library": true,
    "task-delegation": true,
  },
  logMinLevel: "info",
};

const store = new Store<AppSettings>({
  name: "prism-settings",
  defaults,
});

function persistStore(patch: Record<string, unknown>): void {
  try {
    store.set(patch as never);
  } catch (err) {
    log.warn("settings.persist.fail", { error: shortLogDetail(err) });
    throw err;
  }
}

function applyLogMinLevel(value: unknown): void {
  if (isLogLevel(value)) setLogLevel(value);
}

function encryptIfAvailable(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString("base64");
  }
  return value;
}

function decryptIfAvailable(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    } catch {
      return value;
    }
  }
  return value;
}

const SENSITIVE_KEYS = [
  "zoteroApiKey",
  "zoteroUserId",
  "aiApiKeys",
  "mineruApiToken",
  "semanticScholarApiKey",
  "pubmedApiKey",
] as const;

function isSensitiveKey(key: string): boolean {
  return (SENSITIVE_KEYS as readonly string[]).includes(key);
}

export function getSettings(): AppSettings {
  // Read ALL stored keys so dynamic renderer-side keys
  // (editorSyntaxTheme, pdfDarkMode, manuscriptDir, etc.) are
  // automatically included — no more manual enumeration.
  const raw = (store as unknown as { store: Record<string, unknown> }).store;

  // Read all plain-text fields directly
  const settings: AppSettings = {
    aiModel: (store.get("aiModel") as AppSettings["aiModel"]) || defaults.aiModel,
    theme: (store.get("theme") as AppSettings["theme"]) || defaults.theme,
    sidebarCollapsed:
      (store.get("sidebarCollapsed") as boolean) ?? defaults.sidebarCollapsed,
    rightPanelCollapsed:
      (store.get("rightPanelCollapsed") as boolean) ?? defaults.rightPanelCollapsed,
    lastProjectPath: store.get("lastProjectPath") as string | undefined,
  };

  // Decrypt sensitive fields
  const encryptedKey = store.get("zoteroApiKey") as string | undefined;
  if (encryptedKey) {
    settings.zoteroApiKey = decryptIfAvailable(encryptedKey);
  }

  const encryptedUserId = store.get("zoteroUserId") as string | undefined;
  if (encryptedUserId) {
    settings.zoteroUserId = decryptIfAvailable(encryptedUserId);
  }

  const encryptedMineru = store.get("mineruApiToken") as string | undefined;
  if (encryptedMineru) {
    settings.mineruApiToken = decryptIfAvailable(encryptedMineru);
  }

  const encryptedS2 = store.get("semanticScholarApiKey") as string | undefined;
  if (encryptedS2) {
    settings.semanticScholarApiKey = decryptIfAvailable(encryptedS2);
  }

  const encryptedPubmed = store.get("pubmedApiKey") as string | undefined;
  if (encryptedPubmed) {
    settings.pubmedApiKey = decryptIfAvailable(encryptedPubmed);
  }

  const encryptedAiKeys = store.get("aiApiKeys") as string | undefined;
  if (encryptedAiKeys) {
    try {
      const decrypted = decryptIfAvailable(encryptedAiKeys);
      const parsed = JSON.parse(decrypted) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        settings.aiApiKeys = parsed as Record<string, string>;
      } else {
        // Decrypt returned ciphertext / garbage after app-name / userData moves.
        log.warn("aiApiKeys decrypt did not yield a key map — re-enter API keys in Settings → AI");
        settings.aiApiKeys = {};
      }
    } catch {
      const rawKeys = store.get("aiApiKeys");
      // Plaintext object fallback from before encryption was added
      if (rawKeys && typeof rawKeys === "object" && !Array.isArray(rawKeys)) {
        settings.aiApiKeys = rawKeys as Record<string, string>;
      } else {
        log.warn("aiApiKeys could not be decrypted — re-enter API keys in Settings → AI");
        settings.aiApiKeys = {};
      }
    }
  } else {
    settings.aiApiKeys = {};
  }

  // Start with explicitly-read settings, then overlay all raw store keys
  // so that renderer-side dynamic keys (editorSyntaxTheme, etc.) survive
  // round-trips without needing manual enumeration here.
  const result: Record<string, unknown> = { ...raw, ...settings };
  // Decrypted secrets take precedence over encrypted raw
  if (settings.zoteroApiKey !== undefined)
    result.zoteroApiKey = settings.zoteroApiKey;
  if (settings.zoteroUserId !== undefined)
    result.zoteroUserId = settings.zoteroUserId;
  if (settings.mineruApiToken !== undefined)
    result.mineruApiToken = settings.mineruApiToken;
  if (settings.semanticScholarApiKey !== undefined)
    result.semanticScholarApiKey = settings.semanticScholarApiKey;
  if (settings.pubmedApiKey !== undefined)
    result.pubmedApiKey = settings.pubmedApiKey;
  if (settings.aiApiKeys !== undefined)
    result.aiApiKeys = settings.aiApiKeys;

  // One-shot: v1 `"auto"` meant edit-auto; v2 makes `"auto"` full OpenCode auto.
  const migrated = migratePermissionModeSetting(
    result.permissionMode as string | undefined,
    result.permissionModeSchemaVersion as number | undefined,
  );
  if (migrated.changed) {
    result.permissionMode = migrated.mode;
    result.permissionModeSchemaVersion = migrated.schemaVersion;
    persistStore({
      permissionMode: migrated.mode,
      permissionModeSchemaVersion: migrated.schemaVersion,
    });
  } else if (result.permissionModeSchemaVersion !== PERMISSION_MODE_SCHEMA_VERSION) {
    result.permissionModeSchemaVersion = PERMISSION_MODE_SCHEMA_VERSION;
    persistStore({ permissionModeSchemaVersion: PERMISSION_MODE_SCHEMA_VERSION });
  }

  applyLogMinLevel(result.logMinLevel);
  return result as AppSettings;
}

export function updateSettings(patch: Partial<AppSettings>): void {
  const encrypted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (isSensitiveKey(key)) {
      const stringValue = typeof value === "string" ? value : JSON.stringify(value);
      encrypted[key] = encryptIfAvailable(stringValue);
    } else {
      encrypted[key] = value;
    }
  }

  persistStore(encrypted);
  if ("logMinLevel" in patch) applyLogMinLevel(patch.logMinLevel);
}

/**
 * R11（Phase 3）：清空 legacy 的 builtin command 全局启停键。
 * 状态已由 packs-state 迁移进首个迁移项目的 packs.json disabledContent。
 */
export function clearLegacyBuiltinCommandStates(): void {
  store.delete("builtinCommands" as keyof AppSettings);
}

/**
 * GC for provider removals that predate the scrub in
 * buildRemoveCustomProviderPatch (≤ v0.6.7): per-provider maps can retain
 * entries for ids no longer listed in `aiCustomProviders`. Those orphans are
 * invisible in Settings yet still get re-registered and env-exported at every
 * startup. Prune them. Runs on every launch; cheap and idempotent.
 *
 * Skipped while `aiCustomProviders` is not an array — the renderer-side
 * legacy migration may still legitimately promote keyed former built-ins
 * into the list, so nothing is an orphan yet.
 *
 * Returns the pruned provider ids (for startup logging).
 */
export function pruneOrphanProviderSettings(): string[] {
  const raw = (store as unknown as { store: Record<string, unknown> }).store;
  const list = raw.aiCustomProviders;
  if (!Array.isArray(list)) return [];

  const listed = new Set<string>();
  for (const entry of list) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id.trim()) listed.add(id);
  }

  const settings = getSettings() as Record<string, unknown>;
  const pruned = new Set<string>();
  const patch: Record<string, unknown> = {};

  const pruneMap = (key: string): void => {
    const map = settings[key];
    if (!map || typeof map !== "object" || Array.isArray(map)) return;
    const entries = Object.entries(map as Record<string, unknown>);
    const kept = entries.filter(([id]) => {
      if (listed.has(id)) return true;
      pruned.add(id);
      return false;
    });
    if (kept.length !== entries.length) {
      patch[key] = Object.fromEntries(kept);
    }
  };

  pruneMap("aiApiKeys");
  pruneMap("aiBaseUrls");
  pruneMap("aiEnabledModels");
  pruneMap("aiCustomModels");
  pruneMap("aiCustomModelsData");

  const verified = settings.aiVerifiedProviders;
  if (Array.isArray(verified)) {
    const kept = verified.filter((id) => {
      if (typeof id === "string" && !listed.has(id)) {
        pruned.add(id);
        return false;
      }
      return true;
    });
    if (kept.length !== verified.length) patch.aiVerifiedProviders = kept;
  }

  if (Object.keys(patch).length > 0) {
    updateSettings(patch as Partial<AppSettings>);
    log.debug("Pruned orphan provider leftovers", { ids: [...pruned].sort() });
  }
  return [...pruned].sort();
}
