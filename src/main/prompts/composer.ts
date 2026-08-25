// prism-next/src/main/prompts/composer.ts

import type { PromptLayer, PromptContext } from "./types";
import { createLogger } from "../app/logger";

const log = createLogger("prompt-composer", "agent");

/** DJB2 hash — fast, deterministic, sufficient for cache-key uniqueness.
 *  Returns a base-36 string for compact JSON-safe representation. */
function djb2Hash(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export interface ComposeOptions {
  /** Skip these layer ids (e.g. custom-rules for per-turn injection). */
  excludeLayerIds?: string[];
  /** When set, only include these layer ids. */
  onlyLayerIds?: string[];
}

export class PromptComposer {
  private layers: PromptLayer[] = [];

  /** Cached result for the last context. Keyed by JSON-stable hash. */
  private cacheKey: string | null = null;
  private cachedResult: string | null = null;

  /** Static cache: layers whose build() does NOT depend on context.
   *  Key = layer.id, Value = precomputed result string ("" = skip). */
  private staticCache: Map<string, string> = new Map();

  // ── Registration ──────────────────────────────────────────

  /** Register a layer. Re-sorts by priority. */
  register(layer: PromptLayer): void {
    this.layers.push(layer);
    this.layers.sort((a, b) => a.priority - b.priority);
    // Precompute static layers immediately
    this.tryPrecompute(layer);
  }

  /** Remove a layer by id. */
  unregister(id: string): void {
    this.layers = this.layers.filter((l) => l.id !== id);
    this.staticCache.delete(id);
    this.invalidate();
  }

  /** Enable or disable a layer by id. */
  setEnabled(id: string, enabled: boolean): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.enabled = enabled;
      this.invalidate();
    }
  }

  // ── Query ─────────────────────────────────────────────────

  /** Get all registered layers (for the settings UI). */
  getLayers(): readonly PromptLayer[] {
    return this.layers;
  }

  // ── Composition ───────────────────────────────────────────

  /** Assemble the final prompt string from all enabled layers. */
  compose(ctx: PromptContext, options?: ComposeOptions): string {
    const exclude = new Set(options?.excludeLayerIds ?? []);
    const only = options?.onlyLayerIds ? new Set(options.onlyLayerIds) : null;
    const partial = exclude.size > 0 || only !== null;

    const key = partial
      ? `${this.computeCacheKey(ctx, { excludeLayerIds: options?.excludeLayerIds })}|ex:${[...exclude].sort().join(",")}|on:${only ? [...only].sort().join(",") : ""}`
      : this.computeCacheKey(ctx);

    if (!partial && key === this.cacheKey && this.cachedResult !== null) {
      return this.cachedResult;
    }

    const parts: string[] = [];

    for (const layer of this.layers) {
      if (exclude.has(layer.id)) continue;
      if (only && !only.has(layer.id)) continue;
      if (!layer.enabled) continue;

      // Static cache hit — use precomputed result
      const cached = this.staticCache.get(layer.id);
      if (cached !== undefined) {
        if (cached) parts.push(cached);
        continue;
      }

      // Dynamic layer — call build()
      try {
        const result = layer.build(ctx);
        if (result) parts.push(result);
      } catch (err) {
        log.warn(`Layer "${layer.id}" failed`, { error: (err as Error).message });
      }
    }

    const assembled = parts.join("\n\n");
    if (!partial) {
      this.cacheKey = key;
      this.cachedResult = assembled;
    }
    return assembled;
  }

  /** Invalidate all caches. Call when settings or project data changes. */
  invalidate(): void {
    this.cacheKey = null;
    this.cachedResult = null;
  }

  /** Precompute all static layers. Call after registering all app-level layers. */
  preComputeStatic(): void {
    for (const layer of this.layers) {
      if (this.isStatic(layer)) {
        this.tryPrecompute(layer);
      }
    }
  }

  // ── Private ───────────────────────────────────────────────

  /** A layer is "static" if it declares isStatic and doesn't depend on
   *  PromptContext. Precomputed once at registration time for efficiency. */
  private isStatic(layer: PromptLayer): boolean {
    return layer.isStatic;
  }

  private tryPrecompute(layer: PromptLayer): void {
    if (!this.isStatic(layer)) return;
    try {
      this.staticCache.set(layer.id, layer.build({}));
    } catch {
      // Will retry on compose()
    }
  }

  /** Stable fingerprint for prompt configuration (session staleness checks). */
  fingerprint(ctx: PromptContext, options?: { excludeLayerIds?: string[] }): string {
    return this.computeCacheKey(ctx, options);
  }

  private computeCacheKey(
    ctx: PromptContext,
    options?: { excludeLayerIds?: string[] },
  ): string {
    const exclude = new Set(options?.excludeLayerIds ?? []);
    const excludeRules = exclude.has("custom-rules");
    const excludeAgentsMd = exclude.has("agents-md");
    // Stable hash: sort keys to avoid ordering differences.
    // Content fields use djb2 hash so equivalent content always matches
    // regardless of surrounding whitespace or encoding differences.
    const normalized: Record<string, unknown> = {
      pr: ctx.projectRoot ?? "",
      wd: ctx.workspaceDirs
        ? ctx.workspaceDirs.map((d) => `${d.name}:${d.function}:${(d as any).description ?? ""}`).sort()
        : [],
      amd: excludeAgentsMd
        ? "0"
        : ctx.agentsMdContent
          ? djb2Hash(ctx.agentsMdContent)
          : "0",
      ucp: ctx.userCustomPrompt ? djb2Hash(ctx.userCustomPrompt) : "0",
      acr: excludeRules
        ? "0"
        : ctx.customRules?.length
          ? djb2Hash(ctx.customRules.map((r) => `${r.name}:${r.content}`).join("|"))
          : "0",
      acrs: excludeRules ? "0" : ctx.customRules?.length ? String(ctx.customRules.length) : "0",
      en: this.layers.map((l) => `${l.id}=${l.enabled ? 1 : 0}`).join(","),
    };
    return JSON.stringify(normalized);
  }
}
