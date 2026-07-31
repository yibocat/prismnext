/**
 * OpenRouter model IDs, migration, and API/catalog row parsing.
 * Official IDs use dots for Anthropic revisions (claude-sonnet-4.6), not hyphens.
 *
 * Note: do not import `opencode-models-catalog` / `opencode-provider` here —
 * those modules import this file (or each other) and would create a TDZ cycle.
 */

export const OPENROUTER_PROVIDER_ID = "openrouter";

/** Legacy Prism preset IDs → OpenRouter / models.dev canonical IDs. */
export const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-opus-4-8": "anthropic/claude-opus-4.8",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "google/gemini-3.1-pro": "google/gemini-3.1-pro-preview",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatContextWindow(tokens: number | undefined): string {
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

export function normalizeOpenRouterModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  return OPENROUTER_MODEL_ALIASES[trimmed] ?? trimmed;
}

export function migrateOpenRouterEnabledModelIds(modelIds: string[]): string[] {
  return [...new Set(modelIds.map((id) => normalizeOpenRouterModelId(id)))];
}

/** Migrate `openrouter/<modelId>` thought-level / effort preference keys. */
export function migrateOpenRouterPreferenceKey(key: string): string {
  const prefix = `${OPENROUTER_PROVIDER_ID}/`;
  if (!key.startsWith(prefix)) return key;
  const modelId = key.slice(prefix.length);
  const normalized = normalizeOpenRouterModelId(modelId);
  return `${prefix}${normalized}`;
}

export interface OpenRouterModelRow {
  id: string;
  name: string;
  contextWindow: string;
  capabilities?: { vision?: boolean };
  description?: string;
}

function visionFromInputModalities(input: unknown): boolean {
  if (!Array.isArray(input)) return false;
  return input.some((m) => m === "image" || m === "video");
}

/** Parse OpenRouter `GET /api/v1/models` JSON body. */
export function parseOpenRouterApiModels(data: unknown): OpenRouterModelRow[] {
  if (!isRecord(data)) return [];
  const list = data.data;
  if (!Array.isArray(list)) return [];

  const rows: OpenRouterModelRow[] = [];
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) continue;
    // Skip OpenRouter meta routers (no stable model surface).
    if (id === "openrouter/auto" || id === "openrouter/free") continue;
    const name =
      typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
    const description =
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : undefined;
    const context =
      typeof raw.context_length === "number" ? raw.context_length : undefined;
    const architecture = isRecord(raw.architecture) ? raw.architecture : null;
    const input =
      architecture?.input_modalities ??
      architecture?.modality ??
      undefined;
    const inputList = Array.isArray(input)
      ? input
      : typeof input === "string"
        ? input.split("+").map((s) => s.trim())
        : [];
    rows.push({
      id: normalizeOpenRouterModelId(id),
      name,
      contextWindow: formatContextWindow(context),
      capabilities: { vision: visionFromInputModalities(inputList) },
      description,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
