import Store from "electron-store";
import { safeStorage } from "electron";

export interface AppSettings {
  aiModel: "default" | "sonnet" | "opus" | "haiku";
  effortLevel: "low" | "medium" | "high";
  theme: "dark" | "light" | "system";
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  lastProjectPath?: string;
  zoteroApiKey?: string;
  zoteroUserId?: string;
  /** Custom system prompt for the agent shell (Layer 1).
   *  When empty/undefined, APP_SYSTEM_PROMPT from app-shell.ts is used. */
  agentSystemPrompt?: string;
}

const defaults: AppSettings = {
  aiModel: "default",
  effortLevel: "low",
  theme: "dark",
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  agentSystemPrompt: "",
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

export function getSettings(): AppSettings {
  // Read ALL stored keys so dynamic renderer-side keys
  // (editorSyntaxTheme, pdfDarkMode, manuscriptDir, etc.) are
  // automatically included — no more manual enumeration.
  const raw = (store as unknown as { store: Record<string, unknown> }).store;

  // Read all plain-text fields directly
  const settings: AppSettings = {
    aiModel: (store.get("aiModel") as AppSettings["aiModel"]) || defaults.aiModel,
    effortLevel:
      (store.get("effortLevel") as AppSettings["effortLevel"]) || defaults.effortLevel,
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

  // Start with explicitly-read settings, then overlay all raw store keys
  // so that renderer-side dynamic keys (editorSyntaxTheme, etc.) survive
  // round-trips without needing manual enumeration here.
  const result: Record<string, unknown> = { ...raw, ...settings };
  // Decrypted secrets take precedence over encrypted raw
  if (settings.zoteroApiKey !== undefined)
    result.zoteroApiKey = settings.zoteroApiKey;
  if (settings.zoteroUserId !== undefined)
    result.zoteroUserId = settings.zoteroUserId;
  return result as AppSettings;
}

export function updateSettings(patch: Partial<AppSettings>): void {
  const encrypted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if ((key === "zoteroApiKey" || key === "zoteroUserId") && typeof value === "string") {
      encrypted[key] = encryptIfAvailable(value);
    } else {
      encrypted[key] = value;
    }
  }

  store.set(encrypted as any);
}
