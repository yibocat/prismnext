/**
 * Build the OpenCode child-process credential env from settings (+ optional
 * call-site overrides). Startup and chat:send must use the same builder so a
 * cold spawn is not immediately restarted for a trim/baseURL mismatch.
 *
 * Critical: opencode-go / opencode-zen / opencode all map to OPENCODE_API_KEY.
 * Naively looping `Object.entries(aiApiKeys)` last-wins caused startup to bake
 * Zen's key while the first send overwrote Go's key → false credential restart.
 */
import { getSettings } from "../services/settings";
import {
  isOpenCodeCatalogProvider,
  OPENCODE_API_KEY_ENV,
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_ZEN_PROVIDER_ID,
  providerApiKeyEnvVar,
} from "../../shared/opencode-provider";

export type BuildOpenCodeCredentialEnvOptions = {
  /** Prefer this catalog provider's key for OPENCODE_API_KEY (e.g. current chat provider). */
  preferredCatalogProvider?: string;
};

const CATALOG_KEY_PRIORITY = [
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_ZEN_PROVIDER_ID,
  "opencode",
] as const;

/**
 * Pick a single OPENCODE_API_KEY from catalog providers with stable priority:
 * preferred → settings.aiProvider (if catalog) → go → zen → opencode.
 */
export function resolveOpenCodeApiKey(
  aiApiKeys: Record<string, string>,
  preferredCatalogProvider?: string,
  settingsAiProvider?: string,
): string | undefined {
  const candidates: string[] = [];
  const preferred = preferredCatalogProvider?.trim();
  if (preferred && isOpenCodeCatalogProvider(preferred)) {
    candidates.push(preferred);
  }
  const fromSettings = settingsAiProvider?.trim();
  if (fromSettings && isOpenCodeCatalogProvider(fromSettings)) {
    candidates.push(fromSettings);
  }
  for (const id of CATALOG_KEY_PRIORITY) {
    candidates.push(id);
  }

  const seen = new Set<string>();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    const key = aiApiKeys[id]?.trim();
    if (key) return key;
  }
  return undefined;
}

export function buildOpenCodeCredentialEnv(
  extraEnv?: Record<string, string>,
  options?: BuildOpenCodeCredentialEnvOptions,
): Record<string, string> {
  const settings = getSettings() as Record<string, unknown>;
  const rawApiKeys = (settings.aiApiKeys as Record<string, string>) || {};
  const aiBaseUrls = (settings.aiBaseUrls as Record<string, string>) || {};
  const settingsAiProvider =
    typeof settings.aiProvider === "string" ? settings.aiProvider : undefined;

  // Drop orphan keys whose provider was removed from aiCustomProviders —
  // exporting them would resurrect the vendor inside OpenCode. Only gate when
  // the list exists: an unwritten list means the renderer migration may still
  // promote keyed legacy built-ins, so nothing is an orphan yet.
  const customProviders = settings.aiCustomProviders as
    | Array<{ id?: unknown }>
    | undefined;
  const aiApiKeys: Record<string, string> = {};
  if (Array.isArray(customProviders)) {
    const listed = new Set(
      customProviders
        .map((p) => (typeof p?.id === "string" ? p.id : ""))
        .filter(Boolean),
    );
    for (const [provider, key] of Object.entries(rawApiKeys)) {
      if (listed.has(provider)) aiApiKeys[provider] = key;
    }
  } else {
    Object.assign(aiApiKeys, rawApiKeys);
  }

  const fromSettings: Record<string, string> = {};
  for (const [provider, apiKey] of Object.entries(aiApiKeys)) {
    if (!apiKey?.trim()) continue;
    // Catalog providers share OPENCODE_API_KEY — resolved once below.
    if (isOpenCodeCatalogProvider(provider)) continue;
    fromSettings[providerApiKeyEnvVar(provider)] = apiKey.trim();
    if (aiBaseUrls[provider]?.trim()) {
      fromSettings[`${provider.replace(/-/g, "_").toUpperCase()}_BASE_URL`] =
        aiBaseUrls[provider].trim();
    }
  }

  const openCodeKey = resolveOpenCodeApiKey(
    aiApiKeys,
    options?.preferredCatalogProvider,
    settingsAiProvider,
  );
  if (openCodeKey) {
    fromSettings[OPENCODE_API_KEY_ENV] = openCodeKey;
  }

  if (!extraEnv) return fromSettings;

  const merged = { ...fromSettings };
  for (const [k, v] of Object.entries(extraEnv)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const trimmed = v.trim();
    // Ignore call-site OPENCODE_API_KEY when it matches any catalog key we
    // already know — prevents Go/Zen swap from forcing a restart when the
    // preferred resolution already picked the right value. If it is a truly
    // new key (not in settings), keep the override so login-from-composer works.
    if (k === OPENCODE_API_KEY_ENV) {
      const known = new Set(
        CATALOG_KEY_PRIORITY.map((id) => aiApiKeys[id]?.trim()).filter(Boolean) as string[],
      );
      if (merged[OPENCODE_API_KEY_ENV] && known.has(trimmed)) {
        // Prefer explicit preferred resolution already in merged; only replace
        // when preferredCatalogProvider was set and this key belongs to it.
        const preferred = options?.preferredCatalogProvider?.trim();
        if (preferred && isOpenCodeCatalogProvider(preferred)) {
          const preferredKey = aiApiKeys[preferred]?.trim();
          if (preferredKey) {
            merged[OPENCODE_API_KEY_ENV] = preferredKey;
            continue;
          }
        }
        continue;
      }
    }
    merged[k] = trimmed;
  }
  return merged;
}

/** Keys whose trimmed values differ (for restart diagnostics — never log secrets). */
export function diffCredentialEnvKeys(
  baked: Record<string, string>,
  next: Record<string, string>,
): Array<{ key: string; bakedLen: number; nextLen: number }> {
  const keys = new Set([
    ...Object.keys(baked),
    ...Object.keys(next),
  ]);
  const out: Array<{ key: string; bakedLen: number; nextLen: number }> = [];
  for (const key of keys) {
    if (!/API_KEY|BASE_URL/i.test(key)) continue;
    const a = (baked[key] ?? "").trim();
    const b = (next[key] ?? "").trim();
    if (!b) continue;
    if (a !== b) out.push({ key, bakedLen: a.length, nextLen: b.length });
  }
  return out;
}
