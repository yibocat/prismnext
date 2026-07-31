/**
 * OpenCode ACP effort / variant catalog — shared types and key mapping.
 *
 * Runtime authority: OpenCode `configOptions` (id `effort`) and provider model
 * `variants` from ACP `providers/list` (same catalog as TUI `/variants`).
 */

import {
  normalizeOpenCodeModelId,
  openCodeRuntimeProviderId,
  OPENCODE_ZEN_PROVIDER_ID,
} from "./opencode-provider";

/** ACP SessionConfigOption shape (subset used for effort). */
export interface OpencodeSessionConfigOption {
  id: string;
  name?: string;
  category?: string;
  type?: string;
  currentValue?: string;
  options?: Array<{ value: string; name?: string; description?: string }>;
}

export type EffortCatalogSource = "acp" | "fallback" | "none";

export interface ModelEffortResult {
  efforts: string[];
  current?: string;
  source: EffortCatalogSource;
}

export interface EffortCatalogSnapshot {
  /** Keys: `prismProviderId/modelId` → effort variant ids */
  entries: Record<string, string[]>;
  fetchedAt: number;
}

export const EFFORT_CATALOG_TTL_MS = 30 * 60 * 1000;

export const OPENCODE_DEFAULT_VARIANT = "default";

/** Prism settings key for per-model effort: `providerId/modelId`. */
export function modelEffortKey(providerId: string, modelId: string): string {
  const normalized = normalizeOpenCodeModelId(providerId, modelId.trim());
  return `${providerId}/${normalized}`;
}

/** OpenCode runtime ref for session/set_model: `runtimeProvider/modelId`. */
export function runtimeModelRef(providerId: string, modelId: string): string {
  const runtimeProvider = openCodeRuntimeProviderId(providerId);
  const normalized = normalizeOpenCodeModelId(providerId, modelId.trim());
  return `${runtimeProvider}/${normalized}`;
}

/**
 * Map OpenCode runtime provider id → Prism settings provider id.
 * `opencode` (Zen catalog) → `opencode-zen`.
 */
export function prismProviderFromRuntime(runtimeProviderId: string): string {
  if (runtimeProviderId === "opencode") return OPENCODE_ZEN_PROVIDER_ID;
  return runtimeProviderId;
}

export function runtimeProviderFromPrism(prismProviderId: string): string {
  return openCodeRuntimeProviderId(prismProviderId);
}

/** Parse `runtimeProvider/modelId` from session/set_model. */
export function parseRuntimeModelRef(
  modelRef: string,
): { runtimeProvider: string; modelId: string } | null {
  const trimmed = modelRef.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return null;
  const runtimeProvider = trimmed.slice(0, slash);
  const modelId = trimmed.slice(slash + 1);
  if (!runtimeProvider || !modelId) return null;
  return { runtimeProvider, modelId };
}

export function prismModelFromRuntimeRef(
  modelRef: string,
): { providerId: string; modelId: string } | null {
  const parsed = parseRuntimeModelRef(modelRef);
  if (!parsed) return null;
  return {
    providerId: prismProviderFromRuntime(parsed.runtimeProvider),
    modelId: parsed.modelId,
  };
}

/** Variant ids from models.dev / OpenCode cache `reasoning_options`. */
export function effortIdsFromReasoningOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const out: string[] = [];
  for (const opt of options) {
    if (!opt || typeof opt !== "object") continue;
    const entry = opt as { type?: string; values?: unknown };
    if (entry.type === "effort" && Array.isArray(entry.values)) {
      for (const value of entry.values) {
        if (typeof value === "string") out.push(value);
      }
    } else if (entry.type === "toggle") {
      out.push("none", "thinking");
    } else if (entry.type === "budget_tokens") {
      out.push("high", "max");
    }
  }
  return filterEffortVariantIds(out);
}

/** Append validated effort variant to OpenCode `session/set_model` ref. */
export function appendEffortToRuntimeModelRef(
  modelRef: string,
  effort: string | undefined,
): string {
  const base = modelRef.trim();
  const trimmed = effort?.trim();
  if (!trimmed || trimmed === OPENCODE_DEFAULT_VARIANT) return base;
  if (base.endsWith(`/${trimmed}`)) return base;
  return `${base}/${trimmed}`;
}

/** Variant ids exposed in UI (hide internal default sentinel). */
export function filterEffortVariantIds(variantKeys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of variantKeys) {
    if (!key || key === OPENCODE_DEFAULT_VARIANT) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function parseEffortConfigOption(
  configOptions: OpencodeSessionConfigOption[] | undefined | null,
): { current?: string; options: string[] } | null {
  if (!configOptions?.length) return null;
  const effort = configOptions.find((o) => o.id === "effort");
  if (!effort?.options?.length) return null;
  const options = filterEffortVariantIds(
    effort.options.map((o) => o.value).filter(Boolean),
  );
  if (options.length === 0) return null;
  const current =
    effort.currentValue && effort.currentValue !== OPENCODE_DEFAULT_VARIANT
      ? effort.currentValue
      : undefined;
  return { current, options };
}

/** Sanitize user effort: undefined when empty, default, or invalid. */
export function sanitizeEffortChoice(
  effort: string | undefined,
  allowed: string[] | null | undefined,
): string | undefined {
  const trimmed = effort?.trim();
  if (!trimmed || trimmed === OPENCODE_DEFAULT_VARIANT) return undefined;
  if (!allowed?.length) return undefined;
  return allowed.includes(trimmed) ? trimmed : undefined;
}
