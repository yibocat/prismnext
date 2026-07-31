/**
 * Anthropic direct API model ID aliases (hyphen form, not OpenRouter dots).
 */

export const ANTHROPIC_PROVIDER_ID = "anthropic";

/** Prefer OpenCode “latest” aliases over dated snapshots when equivalent. */
export const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  "claude-sonnet-4-5-20250929": "claude-sonnet-4-5",
  "claude-haiku-4-5-20251001": "claude-haiku-4-5",
};

export function normalizeAnthropicModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  return ANTHROPIC_MODEL_ALIASES[trimmed] ?? trimmed;
}

export function migrateAnthropicEnabledModelIds(modelIds: string[]): string[] {
  return [...new Set(modelIds.map((id) => normalizeAnthropicModelId(id)))];
}

export function migrateAnthropicPreferenceKey(key: string): string {
  const prefix = `${ANTHROPIC_PROVIDER_ID}/`;
  if (!key.startsWith(prefix)) return key;
  const modelId = key.slice(prefix.length);
  return `${prefix}${normalizeAnthropicModelId(modelId)}`;
}
