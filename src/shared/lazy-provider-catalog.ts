/**
 * Providers whose Settings model list is lazy-fetched (Fetch button),
 * not auto-merged like OpenCode Go/Zen and not a hand-maintained preset list.
 */

import { OPENROUTER_PROVIDER_ID } from "./openrouter-models";

export const LAZY_CATALOG_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  OPENROUTER_PROVIDER_ID,
] as const;

export type LazyCatalogProviderId = (typeof LAZY_CATALOG_PROVIDER_IDS)[number];

export function isLazyCatalogProvider(providerId: string): boolean {
  return (LAZY_CATALOG_PROVIDER_IDS as readonly string[]).includes(providerId);
}

/** Former Settings “built-in” providers — migrate into aiCustomProviders when a key exists. */
export const LEGACY_BUILTIN_PROVIDER_IDS = ["openai", "google", "deepseek"] as const;

export type LegacyCustomProviderEntry = { id: string; name: string; baseUrl: string };

export type LegacyBuiltinMigrateInput = {
  aiCustomProviders?: LegacyCustomProviderEntry[];
  aiApiKeys?: Record<string, string>;
  aiBaseUrls?: Record<string, string>;
  /** Once true, never re-promote — user may have removed a former built-in. */
  legacyBuiltinProvidersMigrated?: boolean;
};

export type LegacyBuiltinMigrateResult = {
  aiCustomProviders: LegacyCustomProviderEntry[];
  legacyBuiltinProvidersMigrated: true;
  /** True when a former built-in was newly appended. */
  promoted: boolean;
};

/**
 * One-shot upgrade for former built-ins (openai/google/deepseek).
 *
 * - Already migrated → no-op (null).
 * - `aiCustomProviders` already an array → mark migrated only. Never re-append
 *   missing legacy ids (that undid Remove when an orphan API key remained).
 * - List never written (`undefined`) → promote keyed former built-ins into a new list.
 */
export function migrateLegacyBuiltinProviders(
  input: LegacyBuiltinMigrateInput,
  resolvePreset: (id: string) => { name: string; defaultBaseUrl: string } | undefined,
): LegacyBuiltinMigrateResult | null {
  if (input.legacyBuiltinProvidersMigrated) return null;

  if (Array.isArray(input.aiCustomProviders)) {
    return {
      aiCustomProviders: [...input.aiCustomProviders],
      legacyBuiltinProvidersMigrated: true,
      promoted: false,
    };
  }

  const existing: LegacyCustomProviderEntry[] = [];
  const keys = input.aiApiKeys || {};
  let promoted = false;

  for (const id of LEGACY_BUILTIN_PROVIDER_IDS) {
    if (!keys[id]?.trim()) continue;
    const preset = resolvePreset(id);
    existing.push({
      id,
      name: preset?.name ?? id,
      baseUrl: input.aiBaseUrls?.[id] || preset?.defaultBaseUrl || "",
    });
    promoted = true;
  }

  return {
    aiCustomProviders: existing,
    legacyBuiltinProvidersMigrated: true,
    promoted,
  };
}
