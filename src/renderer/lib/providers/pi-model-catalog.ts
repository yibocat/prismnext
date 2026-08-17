/**
 * Runtime model list cache for Pi providers from the Pi model catalog.
 * Prefetches `agent:listModelsCatalog` (main-side Pi ModelRuntime) so Settings
 * and the model picker can show models without a round-trip.
 */

import type { AgentModelRow } from "../../../shared/agent-api";
import type { ModelConfig, ProviderConfig } from "./types";

/** Providers whose model lists are prefetched into the shared catalog cache. */
const CATALOG_PROVIDER_IDS = [
  "opencode",
  "opencode-go",
  "openrouter",
  "zai",
  "zai-coding-cn",
  "moonshotai",
  "moonshotai-cn",
  "minimax",
  "minimax-cn",
  "kimi-coding",
  "qwen-token-plan",
  "qwen-token-plan-cn",
] as const;

let catalogEntries: Record<string, AgentModelRow[]> | null = null;
let catalogFetchedAt = 0;
let prefetchPromise: Promise<Record<string, CatalogModelRow[]> | null> | null = null;
const catalogListeners = new Set<() => void>();

/** Subscribe to cache fill / invalidate (e.g. context ring denominator). */
export function subscribePiModelsCatalog(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

function notifyPiModelsCatalogListeners(): void {
  for (const listener of catalogListeners) {
    try {
      listener();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function isCatalogProvider(providerId: string): boolean {
  return (CATALOG_PROVIDER_IDS as readonly string[]).includes(providerId);
}

function rowToModelConfig(row: AgentModelRow): ModelConfig {
  return {
    id: row.id,
    name: row.name,
    contextWindow: row.contextWindow,
    capabilities: row.capabilities,
    description: row.description,
    ...(row.maxTokens ? { maxTokens: row.maxTokens, maxTokensNum: row.maxTokensNum } : {}),
    ...(row.cost ? { cost: row.cost } : {}),
  };
}

export function getCachedPiCatalogModels(
  providerId: string,
): ModelConfig[] | null {
  if (!isCatalogProvider(providerId) || !catalogEntries) return null;
  const rows = catalogEntries[providerId];
  if (!rows?.length) return null;
  return rows.map(rowToModelConfig);
}

export function getPiCatalogFetchedAt(): number {
  return catalogFetchedAt;
}

export async function prefetchPiModelsCatalog(): Promise<
  Record<string, AgentModelRow[]> | null
> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = (async () => {
    try {
      const snapshot = await window.electronAPI.agentListModelsCatalog();
      catalogEntries = snapshot.entries;
      catalogFetchedAt = snapshot.fetchedAt;
      notifyPiModelsCatalogListeners();
      return catalogEntries;
    } catch {
      return null;
    } finally {
      prefetchPromise = null;
    }
  })();
  return prefetchPromise;
}

/** Merge catalog models into a Pi provider config (no-op when cache is empty). */
export function mergeProviderWithPiCatalog(
  provider: ProviderConfig,
): ProviderConfig {
  if (!isCatalogProvider(provider.id)) return provider;
  const catalogModels = getCachedPiCatalogModels(provider.id);
  if (!catalogModels?.length) return provider;
  return {
    ...provider,
    models: catalogModels,
  };
}

export function invalidatePiModelsCatalogCache(): void {
  catalogEntries = null;
  catalogFetchedAt = 0;
  notifyPiModelsCatalogListeners();
}

/** True when a contextWindow label is missing / placeholder (falls back to 128K). */
export function isUnknownContextWindowLabel(label?: string | null): boolean {
  if (label == null) return true;
  const t = label.trim();
  if (!t) return true;
  return /^(unknown|—|–|-|n\/a)$/i.test(t);
}
