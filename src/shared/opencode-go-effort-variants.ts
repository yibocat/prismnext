/**
 * Build OpenCode `model.variants` entries for opencode-go from models.dev
 * `reasoning_options`. On OpenCode ≤1.17.x, inject variants into opencode.json;
 * on ≥1.18, runtime builds variants from catalog (`reasoningVariants`).
 */

import { effortIdsFromReasoningOptions } from "./opencode-effort";

const OPENAI_COMPAT_NPM = "@ai-sdk/openai-compatible";
const OPENAI_NPM = "@ai-sdk/openai";
const ANTHROPIC_NPM = "@ai-sdk/anthropic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelProviderNpm(
  model: Record<string, unknown>,
  providerNpm: string,
): string {
  const provider = model.provider;
  if (isRecord(provider) && typeof provider.npm === "string") {
    return provider.npm;
  }
  return providerNpm;
}

/** Variant settings for a single effort id (matches OpenCode provider/transform). */
export function variantSettingsForEffort(
  npm: string,
  effortId: string,
): Record<string, unknown> | undefined {
  if (effortId === "default") return undefined;
  switch (npm) {
    case OPENAI_NPM:
    case OPENAI_COMPAT_NPM:
    case "@ai-sdk/xai":
    case "@ai-sdk/gateway":
      return { reasoningEffort: effortId };
    case ANTHROPIC_NPM:
    case "@ai-sdk/google-vertex/anthropic":
      if (effortId === "none") return { thinking: { type: "disabled" } };
      if (effortId === "thinking") {
        return { thinking: { type: "adaptive", display: "summarized" } };
      }
      return {
        thinking: { type: "adaptive", display: "summarized" },
        effort: effortId,
      };
    default:
      return { reasoningEffort: effortId };
  }
}

/** Toggle reasoning_options → none / thinking variants. */
export function toggleVariantSettings(npm: string): Record<string, Record<string, unknown>> {
  if (npm === ANTHROPIC_NPM || npm === "@ai-sdk/google-vertex/anthropic") {
    return {
      none: { thinking: { type: "disabled" } },
      thinking: { thinking: { type: "adaptive", display: "summarized" } },
    };
  }
  if (npm === "@ai-sdk/alibaba") {
    return {
      none: { enableThinking: false },
      thinking: { enableThinking: true },
    };
  }
  return {
    none: { reasoningEffort: "none" },
    thinking: { reasoningEffort: "high" },
  };
}

/** budget_tokens reasoning_options → high / max variant settings. */
export function budgetVariantSettings(
  npm: string,
  budgetMax = 81920,
): Record<string, Record<string, unknown>> {
  const maximum = Math.max(1024, budgetMax);
  const high = Math.max(1024, Math.floor(maximum / 2));
  if (npm === ANTHROPIC_NPM || npm === "@ai-sdk/google-vertex/anthropic") {
    return {
      high: { thinking: { type: "enabled", budgetTokens: high } },
      max: { thinking: { type: "enabled", budgetTokens: maximum } },
    };
  }
  return {
    high: { reasoningEffort: "high" },
    max: { reasoningEffort: "max" },
  };
}

/**
 * Derive OpenCode config `variants` map for one opencode-go model entry.
 * Returns undefined when the model has no reasoning controls.
 */
export function buildGoModelVariants(
  model: Record<string, unknown>,
  providerNpm: string,
): Record<string, Record<string, unknown>> | undefined {
  const npm = modelProviderNpm(model, providerNpm);
  const options = model.reasoning_options;
  if (!Array.isArray(options)) return undefined;

  const variants: Record<string, Record<string, unknown>> = {};
  let hasToggle = false;
  let budgetMax: number | undefined;

  for (const opt of options) {
    if (!isRecord(opt)) continue;
    if (opt.type === "effort" && Array.isArray(opt.values)) {
      for (const value of opt.values) {
        if (typeof value !== "string") continue;
        const settings = variantSettingsForEffort(npm, value);
        if (settings) variants[value] = settings;
      }
    } else if (opt.type === "toggle") {
      hasToggle = true;
    } else if (opt.type === "budget_tokens") {
      const max = typeof opt.max === "number" ? opt.max : undefined;
      budgetMax = max ?? budgetMax;
    }
  }

  if (hasToggle) {
    for (const [id, settings] of Object.entries(toggleVariantSettings(npm))) {
      if (!variants[id]) variants[id] = settings;
    }
  }

  if (options.some((o) => isRecord(o) && o.type === "budget_tokens")) {
    for (const [id, settings] of Object.entries(budgetVariantSettings(npm, budgetMax))) {
      if (!variants[id]) variants[id] = settings;
    }
  }

  // Fallback: use shared effort id parser when options shape is unexpected.
  if (Object.keys(variants).length === 0) {
    for (const id of effortIdsFromReasoningOptions(options)) {
      const settings = variantSettingsForEffort(npm, id);
      if (settings) variants[id] = settings;
    }
  }

  return Object.keys(variants).length > 0 ? variants : undefined;
}

export type OpenCodeGoEffortPatch = Record<
  string,
  { variants: Record<string, Record<string, unknown>> }
>;

/** Build model-id → variants patch from models.dev cache `opencode-go` section. */
export function buildOpenCodeGoEffortPatch(
  modelsDevGo: unknown,
): OpenCodeGoEffortPatch {
  const patch: OpenCodeGoEffortPatch = {};
  if (!isRecord(modelsDevGo)) return patch;

  const providerNpm =
    typeof modelsDevGo.npm === "string" ? modelsDevGo.npm : OPENAI_COMPAT_NPM;
  const models = modelsDevGo.models;
  if (!isRecord(models)) return patch;

  for (const [modelId, modelRaw] of Object.entries(models)) {
    if (!isRecord(modelRaw)) continue;
    const variants = buildGoModelVariants(modelRaw, providerNpm);
    if (variants) patch[modelId] = { variants };
  }
  return patch;
}

/** Merge catalog-derived variants into opencode.json (non-destructive). */
export function mergeOpenCodeGoEffortIntoConfig(
  config: Record<string, unknown>,
  patch: OpenCodeGoEffortPatch,
): { config: Record<string, unknown>; changed: boolean } {
  if (Object.keys(patch).length === 0) {
    return { config, changed: false };
  }

  const providerRoot = (config.provider as Record<string, unknown> | undefined) ?? {};
  const goProvider =
    (providerRoot["opencode-go"] as Record<string, unknown> | undefined) ?? {};
  const models =
    (goProvider.models as Record<string, Record<string, unknown>> | undefined) ?? {};

  let changed = false;
  const nextModels = { ...models };

  for (const [modelId, catalogEntry] of Object.entries(patch)) {
    const existing = nextModels[modelId] ?? {};
    const existingVariants =
      (existing.variants as Record<string, unknown> | undefined) ?? {};
    const mergedVariants = { ...existingVariants };
    for (const [variantId, settings] of Object.entries(catalogEntry.variants)) {
      if (mergedVariants[variantId]) continue;
      mergedVariants[variantId] = settings;
      changed = true;
    }
    if (changed || !nextModels[modelId]) {
      nextModels[modelId] = { ...existing, variants: mergedVariants };
    }
  }

  if (!changed) return { config, changed: false };

  return {
    config: {
      ...config,
      provider: {
        ...providerRoot,
        "opencode-go": {
          ...goProvider,
          models: nextModels,
        },
      },
    },
    changed: true,
  };
}
