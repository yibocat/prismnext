import Store from "electron-store";
import { safeStorage } from "electron";

export interface AppSettings {
  aiModel: "default" | "sonnet" | "opus" | "haiku";
  theme: "dark" | "light" | "system";
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  lastProjectPath?: string;
  lastActiveFileId?: string | null;
  zoteroApiKey?: string;
  zoteroUserId?: string;
  /** Custom system prompt — replaces the built-in core persona (Layer 0) when set.
   *  Modules, AGENTS.md, and project rules still append below. */
  agentSystemPrompt?: string;

  /** Prompt module toggle states. { "citations": true, "workspace-folders": true, ... }
   *  Missing keys default to the module's built-in default. */
  promptModules?: Record<string, boolean>;
  /** Prompt layer toggle states (userToggleable layers only).
   *  { "active-modules": true, "agents-md": true, "custom-rules": true } */
  promptLayers?: Record<string, boolean>;

  /** Built-in slash command enable/disable states. { "compile": false, ... } */
  builtinCommands?: Record<string, boolean>;

  // Renderer-side dynamic keys — stored by electron-store but read via
  // the catch-all `raw` loop in getSettings(). Listed here for documentation.
  [key: string]: unknown;
}

const defaults: AppSettings = {
  aiModel: "default",
  theme: "dark",
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  agentSystemPrompt: "",
  promptModules: {
    "workspace-folders": true,
    "academic-writing": true,
    "citations": true,
    "figures-tables": true,
    "math-equations": true,
  },
};

const store = new Store<AppSettings>({
  name: "prism-settings",
  defaults,
});

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

const SENSITIVE_KEYS = ["zoteroApiKey", "zoteroUserId", "aiApiKeys"] as const;

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

  const encryptedAiKeys = store.get("aiApiKeys") as string | undefined;
  if (encryptedAiKeys) {
    try {
      settings.aiApiKeys = JSON.parse(decryptIfAvailable(encryptedAiKeys)) as Record<string, string>;
    } catch {
      // Handle plaintext fallback from before encryption was added
      settings.aiApiKeys = (store.get("aiApiKeys") as Record<string, string>) || {};
    }
  } else {
    // Plaintext fallback (existing unencrypted data)
    settings.aiApiKeys = (store.get("aiApiKeys") as Record<string, string>) || {};
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
  if (settings.aiApiKeys !== undefined)
    result.aiApiKeys = settings.aiApiKeys;
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

  store.set(encrypted as any);
}
