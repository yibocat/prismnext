import {
  clampDiscoveryLimit,
  normalizeDiscoverySources,
  parseDiscoveryYearRange,
  truncateDiscoveryAbstract,
  type DiscoverLiteratureInput,
  type DiscoverLiteratureResult,
  type DiscoveryHit,
  type DiscoverySourceId,
} from "../../../shared/literature/discovery";
import type { DiscoveryAdapter, OrchestratorOptions } from "./types";

const DEFAULT_WALL_CLOCK_MS = 14_000;
const DEFAULT_PER_SOURCE_TIMEOUT_MS = 9_000;
const DEFAULT_CACHE_TTL_MS = 90_000;

type CacheEntry = {
  expiresAt: number;
  result: DiscoverLiteratureResult;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(input: DiscoverLiteratureInput, sources: DiscoverySourceId[]): string {
  return JSON.stringify({
    sources,
    query: input.query.trim(),
    limit: input.limit ?? null,
    year: input.year ?? null,
    author: input.author ?? null,
  });
}

function truncateHits(hits: DiscoveryHit[]): DiscoveryHit[] {
  return hits.map((h) => ({
    ...h,
    abstract: truncateDiscoveryAbstract(h.abstract),
  }));
}

async function searchWithTimeout(
  adapter: DiscoveryAdapter,
  query: string,
  opts: {
    limit: number;
    year: { from: number; to: number | null } | null;
    author?: string;
    semanticScholarApiKey?: string;
    pubmedApiKey?: string;
    perSourceTimeoutMs: number;
    wallAbort: AbortSignal;
  },
): Promise<DiscoveryHit[]> {
  const controller = new AbortController();
  const onWallAbort = () => controller.abort();
  opts.wallAbort.addEventListener("abort", onWallAbort, { once: true });

  const timer = setTimeout(() => controller.abort(), opts.perSourceTimeoutMs);
  try {
    return await adapter.search(query, {
      limit: opts.limit,
      year: opts.year,
      author: opts.author,
      semanticScholarApiKey: opts.semanticScholarApiKey,
      pubmedApiKey: opts.pubmedApiKey,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.wallAbort.removeEventListener("abort", onWallAbort);
  }
}

export async function runLiteratureDiscovery(
  input: DiscoverLiteratureInput,
  adapters: DiscoveryAdapter[],
  opts: OrchestratorOptions = {},
): Promise<DiscoverLiteratureResult> {
  const now = opts.now ?? (() => Date.now());
  const wallClockMs = opts.wallClockMs ?? DEFAULT_WALL_CLOCK_MS;
  const perSourceTimeoutMs = opts.perSourceTimeoutMs ?? DEFAULT_PER_SOURCE_TIMEOUT_MS;
  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  const query = input.query.trim();
  const sources = normalizeDiscoverySources(input.sources);
  const limit = clampDiscoveryLimit(input.limit);
  const year = parseDiscoveryYearRange(input.year);
  const author = input.author?.trim() || undefined;

  if (cacheTtlMs > 0) {
    const key = cacheKey(input, sources);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) {
      return hit.result;
    }
  }

  const adapterById = new Map(adapters.map((a) => [a.id, a]));
  const wallController = new AbortController();
  const wallTimer = setTimeout(() => wallController.abort(), wallClockMs);

  const hits: DiscoveryHit[] = [];
  const sourcesFailed: DiscoverLiteratureResult["sourcesFailed"] = [];
  const sourcesQueried: DiscoverySourceId[] = [];

  const tasks = sources.map(async (sourceId) => {
    const adapter = adapterById.get(sourceId);
    if (!adapter) {
      sourcesFailed.push({ source: sourceId, error: "adapter not registered" });
      return;
    }
    sourcesQueried.push(sourceId);
    try {
      const sourceHits = await searchWithTimeout(adapter, query, {
        limit,
        year,
        author,
        semanticScholarApiKey: input.semanticScholarApiKey,
        pubmedApiKey: input.pubmedApiKey,
        perSourceTimeoutMs,
        wallAbort: wallController.signal,
      });
      hits.push(...sourceHits);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "timed out"
            : err.message
          : String(err);
      sourcesFailed.push({ source: sourceId, error: message });
    }
  });

  await Promise.all(tasks);
  clearTimeout(wallTimer);

  const result: DiscoverLiteratureResult = {
    query,
    sourcesQueried,
    sourcesFailed,
    hits: truncateHits(hits),
  };

  if (cacheTtlMs > 0) {
    const key = cacheKey(input, sources);
    cache.set(key, { expiresAt: now() + cacheTtlMs, result });
  }

  return result;
}

/** @internal test helper */
export function clearLiteratureDiscoveryCacheForTests(): void {
  cache.clear();
}
