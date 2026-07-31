import { createLogger } from "../services/logger";
import {
  EFFORT_CATALOG_TTL_MS,
  effortIdsFromReasoningOptions,
  filterEffortVariantIds,
  modelEffortKey,
  parseEffortConfigOption,
  prismProviderFromRuntime,
  type EffortCatalogSnapshot,
  type ModelEffortResult,
  type OpencodeSessionConfigOption,
} from "../../shared/opencode-effort";
import { normalizeOpenCodeModelId } from "../../shared/opencode-provider";

const log = createLogger("effort-catalog", "agent");

type CatalogEntry = {
  efforts: string[];
  fetchedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function variantKeysFromModel(model: unknown): string[] {
  if (!isRecord(model)) return [];
  const fromOptions = effortIdsFromReasoningOptions(model.reasoning_options);
  if (fromOptions.length > 0) return fromOptions;
  const variants = model.variants;
  if (!isRecord(variants)) return [];
  return filterEffortVariantIds(Object.keys(variants));
}

function ingestProviderModels(
  entries: Map<string, CatalogEntry>,
  runtimeProviderId: string,
  models: unknown,
  fetchedAt: number,
): void {
  const prismProvider = prismProviderFromRuntime(runtimeProviderId);

  const store = (modelId: string, efforts: string[]) => {
    if (efforts.length === 0) return;
    const normalized = normalizeOpenCodeModelId(prismProvider, modelId);
    const key = modelEffortKey(prismProvider, normalized);
    entries.set(key, { efforts, fetchedAt });
  };

  if (Array.isArray(models)) {
    for (const model of models) {
      if (!isRecord(model)) continue;
      const id = typeof model.id === "string" ? model.id : "";
      if (!id) continue;
      store(id, variantKeysFromModel(model));
    }
    return;
  }

  if (!isRecord(models)) return;
  for (const [modelId, model] of Object.entries(models)) {
    store(modelId, variantKeysFromModel(model));
  }
}

function ingestVariantsByModel(
  entries: Map<string, CatalogEntry>,
  data: unknown,
  fetchedAt: number,
): void {
  if (!isRecord(data)) return;
  const variantsByModel = data.variantsByModel;
  if (!isRecord(variantsByModel)) return;

  for (const [runtimeKey, variants] of Object.entries(variantsByModel)) {
    const slash = runtimeKey.indexOf("/");
    if (slash <= 0) continue;
    const runtimeProvider = runtimeKey.slice(0, slash);
    const modelId = runtimeKey.slice(slash + 1);
    if (!runtimeProvider || !modelId) continue;
    const prismProvider = prismProviderFromRuntime(runtimeProvider);
    const efforts = isRecord(variants)
      ? filterEffortVariantIds(Object.keys(variants))
      : [];
    if (efforts.length === 0) continue;
    const normalized = normalizeOpenCodeModelId(prismProvider, modelId);
    const key = modelEffortKey(prismProvider, normalized);
    entries.set(key, { efforts, fetchedAt });
  }
}

function normalizeProvidersList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];

  const providersRaw = data.providers;
  if (Array.isArray(providersRaw)) return providersRaw;
  if (isRecord(providersRaw)) {
    return Object.entries(providersRaw).map(([id, value]) =>
      isRecord(value) ? { id, ...value } : { id },
    );
  }
  return [];
}

/**
 * Parse ACP `providers/list` (or config.providers-shaped) payload into effort map.
 */
export function buildEffortMapFromProvidersList(data: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const entries = new Map<string, CatalogEntry>();
  const fetchedAt = Date.now();

  ingestVariantsByModel(entries, data, fetchedAt);

  const providers = normalizeProvidersList(data);
  for (const provider of providers) {
    if (!isRecord(provider)) continue;
    const id = typeof provider.id === "string" ? provider.id : "";
    if (!id) continue;
    ingestProviderModels(entries, id, provider.models, fetchedAt);
  }

  for (const [key, entry] of entries) {
    out.set(key, entry.efforts);
  }
  return out;
}

/**
 * Parse OpenCode / models.dev cache (`cache/opencode/models.json`).
 * Used when ACP `providers/list` is unavailable (all bundled OpenCode versions to date).
 */
export function buildEffortMapFromModelsDevCache(data: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!isRecord(data)) return out;

  for (const [providerKey, providerRaw] of Object.entries(data)) {
    if (!isRecord(providerRaw)) continue;
    const runtimeId =
      typeof providerRaw.id === "string" ? providerRaw.id : providerKey;
    const models = providerRaw.models;
    if (!isRecord(models)) continue;
    const prismProvider = prismProviderFromRuntime(runtimeId);

    for (const [modelId, modelRaw] of Object.entries(models)) {
      if (!isRecord(modelRaw)) continue;
      const efforts = variantKeysFromModel(modelRaw);
      if (efforts.length === 0) continue;
      const normalized = normalizeOpenCodeModelId(prismProvider, modelId);
      out.set(modelEffortKey(prismProvider, normalized), efforts);
    }
  }
  return out;
}

export class EffortCatalog {
  private entries = new Map<string, CatalogEntry>();
  private lastRefreshAt = 0;
  private refreshPromise: Promise<void> | null = null;

  clear(): void {
    this.entries.clear();
    this.lastRefreshAt = 0;
    this.refreshPromise = null;
  }

  isStale(now = Date.now()): boolean {
    if (this.entries.size === 0) return true;
    return now - this.lastRefreshAt > EFFORT_CATALOG_TTL_MS;
  }

  ingestProvidersList(data: unknown): number {
    const map = buildEffortMapFromProvidersList(data);
    return this.mergeEffortMap(map, "providers/list");
  }

  ingestModelsDevCache(data: unknown): number {
    const map = buildEffortMapFromModelsDevCache(data);
    return this.mergeEffortMap(map, "models.json");
  }

  private mergeEffortMap(map: Map<string, string[]>, source: string): number {
    if (map.size === 0) return 0;
    const fetchedAt = Date.now();
    for (const [key, efforts] of map) {
      this.entries.set(key, { efforts, fetchedAt });
    }
    this.lastRefreshAt = fetchedAt;
    log.info(`Effort catalog ingested ${map.size} model(s) from ${source}`);
    return map.size;
  }

  ingestConfigOptions(
    prismProviderId: string,
    modelId: string,
    configOptions: OpencodeSessionConfigOption[] | undefined | null,
  ): void {
    const parsed = parseEffortConfigOption(configOptions);
    const key = modelEffortKey(prismProviderId, modelId);
    const fetchedAt = Date.now();
    if (!parsed || parsed.options.length === 0) {
      this.entries.delete(key);
      return;
    }
    this.entries.set(key, { efforts: parsed.options, fetchedAt });
    this.lastRefreshAt = fetchedAt;
  }

  getEfforts(prismProviderId: string, modelId: string): string[] | undefined {
    const key = modelEffortKey(prismProviderId, modelId);
    return this.entries.get(key)?.efforts;
  }

  getSnapshot(): EffortCatalogSnapshot {
    const entries: Record<string, string[]> = {};
    for (const [key, entry] of this.entries) {
      entries[key] = entry.efforts;
    }
    return { entries, fetchedAt: this.lastRefreshAt };
  }

  resolveModelEffort(
    prismProviderId: string,
    modelId: string,
    fallback?: string[] | null,
  ): ModelEffortResult {
    const cached = this.getEfforts(prismProviderId, modelId);
    if (cached && cached.length > 0) {
      return { efforts: cached, source: "acp" };
    }
    if (fallback && fallback.length > 0) {
      return { efforts: fallback, source: "fallback" };
    }
    return { efforts: [], source: "none" };
  }

  /** Returns allowed effort or undefined (use OpenCode default). */
  validateEffort(
    prismProviderId: string,
    modelId: string,
    effort: string | undefined,
    fallback?: string[] | null,
  ): string | undefined {
    const resolved = this.resolveModelEffort(prismProviderId, modelId, fallback);
    const allowed = resolved.efforts;
    if (!allowed.length) return undefined;
    const trimmed = effort?.trim();
    if (!trimmed) return undefined;
    if (allowed.includes(trimmed)) return trimmed;
    log.warn(
      `effort rejected: model=${prismProviderId}/${modelId} invalid=${trimmed} valid=[${allowed.join(", ")}]`,
    );
    return undefined;
  }

  scheduleRefresh(refreshFn: () => Promise<void>): void {
    if (this.refreshPromise) return;
    if (!this.isStale()) return;
    this.refreshPromise = refreshFn()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Effort catalog refresh failed: ${message}`);
      })
      .finally(() => {
        this.refreshPromise = null;
      });
  }

  /** Await a catalog refresh when empty or TTL expired (deduped). */
  async ensureFresh(refreshFn: () => Promise<void>): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise.catch(() => {});
      return;
    }
    if (!this.isStale()) return;
    this.refreshPromise = refreshFn()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Effort catalog refresh failed: ${message}`);
        throw err instanceof Error ? err : new Error(message);
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    await this.refreshPromise.catch(() => {});
  }
}

/** Process-wide effort catalog (tied to OpenCode ACP lifecycle). */
export const effortCatalog = new EffortCatalog();
