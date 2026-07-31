/**
 * OpenCode catalog providers — shared between main (chat/ACP) and renderer (settings).
 *
 * @see https://opencode.ai/docs/go/
 */

import {
  OPENROUTER_PROVIDER_ID,
  normalizeOpenRouterModelId,
} from "./openrouter-models";
import {
  GOOGLE_PROVIDER_ID,
  normalizeGoogleModelId,
} from "./google-models";
import {
  ANTHROPIC_PROVIDER_ID,
  normalizeAnthropicModelId,
} from "./anthropic-models";

export const OPENCODE_GO_PROVIDER_ID = "opencode-go";
export const OPENCODE_ZEN_PROVIDER_ID = "opencode-zen";

const OPENCODE_CATALOG_PROVIDER_IDS = new Set([
  OPENCODE_GO_PROVIDER_ID,
  OPENCODE_ZEN_PROVIDER_ID,
  "opencode",
]);

/** Env var OpenCode uses for Zen + Go subscription keys. */
export const OPENCODE_API_KEY_ENV = "OPENCODE_API_KEY";

/** Legacy wrong IDs from early prismnext presets → canonical Go catalog IDs. */
const OPENCODE_GO_MODEL_ALIASES: Record<string, string> = {
  "GLM-5.2": "glm-5.2",
  "GLM-5.1": "glm-5.1",
  "GLM-5": "glm-5",
  "MiniMax-M3": "minimax-m3",
  "MiniMax-M2.7": "minimax-m2.7",
  "deepseek/deepseek-v4-pro": "deepseek-v4-pro",
  "deepseek/deepseek-v4-flash": "deepseek-v4-flash",
};

/** Legacy Zen preset used OpenRouter-style vendor prefixes — strip for catalog IDs. */
const OPENCODE_ZEN_VENDOR_PREFIX = /^(anthropic|openai|google|deepseek)\//i;

const OPENCODE_ZEN_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-opus-4-8": "claude-opus-4-8",
  "anthropic/claude-sonnet-4-6": "claude-sonnet-4-6",
  "openai/gpt-5.5": "gpt-5.5",
  "openai/gpt-5.4": "gpt-5.4",
  "openai/gpt-5.3-codex": "gpt-5.3-codex",
  "google/gemini-3.5-flash": "gemini-3.5-flash",
  "deepseek/deepseek-v4-pro": "deepseek-v4-pro",
  "deepseek/deepseek-v4-flash": "deepseek-v4-flash",
};

export function isOpenCodeCatalogProvider(providerId: string): boolean {
  return OPENCODE_CATALOG_PROVIDER_IDS.has(providerId);
}

/** Map prismnext settings provider id → OpenCode runtime provider id. */
export function openCodeRuntimeProviderId(prismProviderId: string): string {
  if (prismProviderId === OPENCODE_ZEN_PROVIDER_ID) return "opencode";
  return prismProviderId;
}

export function opencodeApiKeyEnvVar(providerId: string): string | null {
  if (isOpenCodeCatalogProvider(providerId)) return OPENCODE_API_KEY_ENV;
  return null;
}

/** Env var name OpenCode child process expects for a provider API key. */
export function providerApiKeyEnvVar(providerId: string): string {
  const catalog = opencodeApiKeyEnvVar(providerId);
  if (catalog) return catalog;
  if (providerId === "google") return "GOOGLE_GENERATIVE_AI_API_KEY";
  return `${providerId.replace(/-/g, "_").toUpperCase()}_API_KEY`;
}

export function normalizeOpenCodeModelId(providerId: string, modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  if (providerId === OPENCODE_GO_PROVIDER_ID) {
    return OPENCODE_GO_MODEL_ALIASES[trimmed] ?? trimmed.toLowerCase();
  }
  if (providerId === OPENCODE_ZEN_PROVIDER_ID) {
    if (OPENCODE_ZEN_MODEL_ALIASES[trimmed]) return OPENCODE_ZEN_MODEL_ALIASES[trimmed]!;
    return trimmed.replace(OPENCODE_ZEN_VENDOR_PREFIX, "");
  }
  if (providerId === OPENROUTER_PROVIDER_ID) {
    return normalizeOpenRouterModelId(trimmed);
  }
  if (providerId === GOOGLE_PROVIDER_ID) {
    return normalizeGoogleModelId(trimmed);
  }
  if (providerId === ANTHROPIC_PROVIDER_ID) {
    return normalizeAnthropicModelId(trimmed);
  }
  return trimmed;
}

/** Full model ref for session/set_model, e.g. `opencode-go/glm-5.1`. */
export function formatOpenCodeModelRef(providerId: string, modelId: string): string {
  const normalized = normalizeOpenCodeModelId(providerId, modelId);
  if (!normalized) return normalized;
  const runtimeProvider = openCodeRuntimeProviderId(providerId);
  if (normalized.startsWith(`${runtimeProvider}/`)) return normalized;
  return `${runtimeProvider}/${normalized}`;
}

/**
 * Build provider `…/models` list URL for connection tests.
 * OpenCode Go/Zen bases already end with `/v1` — do not append `/v1` again.
 */
export function resolveModelsListUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return "/v1/models";
  if (/\/v\d+$/i.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

/** Migrate enabled-model id lists saved with legacy preset casing. */
export function migrateOpenCodeEnabledModelIds(
  providerId: string,
  modelIds: string[],
): string[] {
  const next = modelIds.map((id) => normalizeOpenCodeModelId(providerId, id));
  return [...new Set(next)];
}
