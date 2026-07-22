import {
  getProviderModels,
  resolveProviderConfig,
  type CustomProviderEntry,
} from "@/lib/providers";
import type { ModelConfig } from "@/lib/providers";

/** Resolve a short display label for the model used on a chat turn. */
export function resolveTurnModelLabel(
  providerId: string | undefined,
  modelId: string | undefined,
  settings: {
    aiCustomProviders?: CustomProviderEntry[];
    aiCustomModelsData?: Record<string, ModelConfig[]>;
  },
): string {
  const provider = (providerId || "").trim();
  const model = (modelId || "").trim();
  if (!model) return provider || "Model";

  const customProviders = settings.aiCustomProviders;
  const customModels = settings.aiCustomModelsData;
  const models = getProviderModels(provider, customModels, customProviders);
  const found = models.find((m) => m.id === model);
  if (found?.name) return found.name;

  const cfg = resolveProviderConfig(provider, customProviders);
  if (cfg?.name) return `${cfg.name} / ${model}`;
  return model;
}
