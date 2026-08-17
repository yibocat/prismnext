/**
 * Runtime model list for opencode-go / opencode-zen from the Pi model catalog.
 */

import type { CatalogModelRow } from "../../../shared/opencode-models-catalog";
import {
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_ZEN_PROVIDER_ID,
} from "../../../shared/opencode-provider";
import type { ModelConfig, ProviderConfig } from "./types";

const CATALOG_PROVIDER_IDS = new Set([
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_ZEN_PROVIDER_ID,
]);

let catalogEntries: Record<string, CatalogModelRow[]> | null = null;
let catalogFetchedAt = 0;
let prefetchPromise: Promise<Record<string, CatalogModelRow[]> | null> | null = null;
const catalogListeners = new Set<() => void>();

/** Subscribe to cache fill / invalidate (e.g. context ring denominator). */
export function subscribeOpenCodeModelsCatalog(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

function notifyOpenCodeModelsCatalogListeners(): void {
  for (const listener of catalogListeners) {
    try {
      listener();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function isCatalogProvider(providerId: string): boolean {
  return CATALOG_PROVIDER_IDS.has(providerId);
}

function rowToModelConfig(row: CatalogModelRow): ModelConfig {
  return {
    id: row.id,
    name: row.name,
    contextWindow: row.contextWindow,
    capabilities: row.capabilities,
    description: row.description,
  };
}

export function getCachedOpenCodeCatalogModels(
  providerId: string,
): ModelConfig[] | null {
  if (!isCatalogProvider(providerId) || !catalogEntries) return null;
  const rows = catalogEntries[providerId];
  if (!rows?.length) return null;
  return rows.map(rowToModelConfig);
}

export function getOpenCodeCatalogFetchedAt(): number {
  return catalogFetchedAt;
}

export async function prefetchOpenCodeModelsCatalog(): Promise<
  Record<string, CatalogModelRow[]> | null
> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = (async () => {
    try {
      const snapshot = await window.electronAPI.agentListModelsCatalog();
      catalogEntries = snapshot.entries;
      catalogFetchedAt = snapshot.fetchedAt;
      notifyOpenCodeModelsCatalogListeners();
      return catalogEntries;
    } catch {
      return null;
    } finally {
      prefetchPromise = null;
    }
  })();
  return prefetchPromise;
}

/** Merge catalog models into an opencode-go / opencode-zen provider config. */
export function mergeProviderWithOpenCodeCatalog(
  provider: ProviderConfig,
): ProviderConfig {
  if (!isCatalogProvider(provider.id)) return provider;
  const catalogModels = getCachedOpenCodeCatalogModels(provider.id);
  if (!catalogModels?.length) return provider;
  return {
    ...provider,
    models: catalogModels,
  };
}

export function invalidateOpenCodeModelsCatalogCache(): void {
  catalogEntries = null;
  catalogFetchedAt = 0;
  notifyOpenCodeModelsCatalogListeners();
}

/** True when a contextWindow label is missing / placeholder (falls back to 128K). */
export function isUnknownContextWindowLabel(label?: string | null): boolean {
  if (label == null) return true;
  const t = label.trim();
  if (!t) return true;
  return /^(unknown|—|–|-|n\/a)$/i.test(t);
}
