/** Settings slice used to resolve which model generates literature summaries. */
export type LiteratureAiMetadataSettings = {
  literatureAiMetadataModel?: string;
  aiProvider?: string;
  aiModel?: string | null;
  aiApiKeys?: Record<string, string>;
};

/** Resolve provider/model for literature AI metadata — no silent defaults. */
export function resolveLiteratureAiMetadataModel(
  settings: LiteratureAiMetadataSettings,
): { provider: string; model: string; modelKey: string } | null {
  const explicit = settings.literatureAiMetadataModel?.trim();
  if (explicit?.includes("/")) {
    const slash = explicit.indexOf("/");
    const provider = explicit.slice(0, slash).trim();
    const model = explicit.slice(slash + 1).trim();
    if (provider && model) {
      return { provider, model, modelKey: `${provider}/${model}` };
    }
  }

  const provider = settings.aiProvider?.trim();
  const model = settings.aiModel?.trim();
  if (!provider || !model) return null;

  return { provider, model, modelKey: `${provider}/${model}` };
}

export function literatureAiMetadataModelLabel(
  settings: LiteratureAiMetadataSettings,
): string | null {
  return resolveLiteratureAiMetadataModel(settings)?.modelKey ?? null;
}

export function isLiteratureAiMetadataConfigured(
  settings: LiteratureAiMetadataSettings,
): boolean {
  const resolved = resolveLiteratureAiMetadataModel(settings);
  if (!resolved) return false;
  const apiKey = settings.aiApiKeys?.[resolved.provider]?.trim();
  return Boolean(apiKey);
}

export const LITERATURE_AI_METADATA_SETUP_HINT =
  "Configure Settings → AI: choose a provider, select a model, and add an API key.";
