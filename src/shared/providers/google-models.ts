/**
 * Google / Gemini model ID aliases for Prism ↔ OpenCode / Google AI.
 * Preview models often ship as `*-preview` before a stable id exists.
 */

export const GOOGLE_PROVIDER_ID = "google";

/** Legacy Prism preset IDs → models.dev / Google AI canonical IDs. */
export const GOOGLE_MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-pro": "gemini-3.1-pro-preview",
  "gemini-3-flash": "gemini-3-flash-preview",
};

export function normalizeGoogleModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  return GOOGLE_MODEL_ALIASES[trimmed] ?? trimmed;
}

export function migrateGoogleEnabledModelIds(modelIds: string[]): string[] {
  return [...new Set(modelIds.map((id) => normalizeGoogleModelId(id)))];
}

/** Migrate `google/<modelId>` thought-level / effort preference keys. */
export function migrateGooglePreferenceKey(key: string): string {
  const prefix = `${GOOGLE_PROVIDER_ID}/`;
  if (!key.startsWith(prefix)) return key;
  const modelId = key.slice(prefix.length);
  return `${prefix}${normalizeGoogleModelId(modelId)}`;
}
