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
