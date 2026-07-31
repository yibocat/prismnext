// Preset providers — available in Add Provider dialog (no always-on built-ins).
export { openaiProvider } from "./openai";
export { googleProvider } from "./google";
export { deepseekProvider } from "./deepseek";
export { openrouterPreset } from "./openrouter";
export { anthropicPreset } from "./anthropic";
export { zhipuPreset } from "./zhipu";
export { minimaxPreset } from "./minimax";
export { kimiPreset } from "./kimi";
export { alibabaPreset } from "./alibaba";
export { opencodeZenPreset } from "./opencode-zen";
export { opencodeGoPreset } from "./opencode-go";

import { openaiProvider } from "./openai";
import { googleProvider } from "./google";
import { deepseekProvider } from "./deepseek";
import { openrouterPreset } from "./openrouter";
import { anthropicPreset } from "./anthropic";
import { zhipuPreset } from "./zhipu";
import { minimaxPreset } from "./minimax";
import { kimiPreset } from "./kimi";
import { alibabaPreset } from "./alibaba";
import { opencodeZenPreset } from "./opencode-zen";
import { opencodeGoPreset } from "./opencode-go";
import type { ProviderConfig } from "../types";

/**
 * Legacy always-on list — empty. All vendors are added via Settings → Add Provider.
 * Kept so existing imports of ALL_PROVIDERS do not break.
 */
export const ALL_PROVIDERS: ProviderConfig[] = [];

/** Preset providers available in the Add Provider dialog dropdown. */
export const PROVIDER_PRESETS: ProviderConfig[] = [
  opencodeZenPreset,
  opencodeGoPreset,
  openrouterPreset,
  openaiProvider,
  anthropicPreset,
  googleProvider,
  deepseekProvider,
  zhipuPreset,
  minimaxPreset,
  kimiPreset,
  alibabaPreset,
];

/** The "Custom" entry — user defines everything manually. */
export const CUSTOM_PRESET: ProviderConfig = {
  id: "__custom__",
  name: "Custom",
  defaultBaseUrl: "",
  models: [],
};

export function getPreset(id: string): ProviderConfig | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
