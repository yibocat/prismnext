/**
 * Parse OpenCode models.dev cache (`cache/opencode/models.json`) into Prism model rows.
 * Used for Settings + picker lists on opencode-go / opencode-zen (no hand-maintained preset lists).
 */

import {
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_ZEN_PROVIDER_ID,
  openCodeRuntimeProviderId,
} from "./opencode-provider";
import { prismProviderFromRuntime } from "./opencode-effort";
import { LAZY_CATALOG_PROVIDER_IDS } from "./lazy-provider-catalog";

export interface CatalogModelRow {
  id: string;
  name: string;
  contextWindow: string;
  capabilities?: { vision?: boolean };
  description?: string;
}

export interface OpenCodeModelsCatalogSnapshot {
  entries: Record<string, CatalogModelRow[]>;
  fetchedAt: number;
}

const PRISM_CATALOG_PROVIDERS = [
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_ZEN_PROVIDER_ID,
] as const;

/** Providers readable from models.json for Settings lazy Fetch. */
export const PRISM_LAZY_FETCH_CATALOG_PROVIDERS = LAZY_CATALOG_PROVIDER_IDS;

/** @deprecated Use PRISM_LAZY_FETCH_CATALOG_PROVIDERS */
export const PRISM_CATALOG_PROVIDERS_WITH_OPENROUTER = [
  ...PRISM_CATALOG_PROVIDERS,
  "openrouter",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Human-readable context size from models.dev token limits. */
export function formatCatalogContextWindow(tokens: number | undefined): string {
  if (!tokens || tokens <= 0) return "Unknown";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    const k = Math.round(tokens / 1000);
    return `${k}K`;
  }
  return String(tokens);
}

export function catalogModelSupportsVision(modalities: unknown): boolean {
  if (!isRecord(modalities)) return false;
  const input = modalities.input;
  if (!Array.isArray(input)) return false;
  return input.some((m) => m === "image" || m === "video");
}

function parseCatalogModel(modelId: string, raw: unknown): CatalogModelRow | null {
  if (!isRecord(raw)) return null;
  // OpenCode runtime rejects deprecated catalog rows (session/set_model → model not found).
  if (raw.status === "deprecated") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : modelId;
  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
  const limit = isRecord(raw.limit) ? raw.limit.context : undefined;
  const contextWindow = formatCatalogContextWindow(
    typeof limit === "number" ? limit : undefined,
  );
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : undefined;
  return {
    id,
    name,
    contextWindow,
    capabilities: {
      vision: catalogModelSupportsVision(raw.modalities),
    },
    description,
  };
}

/** Map models.dev provider section → prism provider id + model rows. */
export function buildModelsCatalogFromModelsDevCache(
  data: unknown,
  prismProviderIds: readonly string[] = PRISM_CATALOG_PROVIDERS,
): Record<string, CatalogModelRow[]> {
  const out: Record<string, CatalogModelRow[]> = {};
  if (!isRecord(data)) return out;

  const wanted = new Set(prismProviderIds);
  for (const [cacheKey, providerRaw] of Object.entries(data)) {
    if (!isRecord(providerRaw)) continue;
    const runtimeId =
      typeof providerRaw.id === "string" ? providerRaw.id : cacheKey;
    const prismId = prismProviderFromRuntime(runtimeId);
    if (!wanted.has(prismId)) continue;

    const models = providerRaw.models;
    if (!isRecord(models)) continue;

    const rows: CatalogModelRow[] = [];
    for (const [modelId, modelRaw] of Object.entries(models)) {
      const row = parseCatalogModel(modelId, modelRaw);
      if (row) rows.push(row);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    out[prismId] = rows;
  }

  return out;
}

/** Resolve cache file key for a prism provider (opencode-zen → opencode). */
export function modelsDevCacheProviderKey(prismProviderId: string): string {
  return openCodeRuntimeProviderId(prismProviderId);
}
