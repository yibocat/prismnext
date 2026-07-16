import type { ProviderConfig } from "../types";

export const anthropicPreset: ProviderConfig = {
  id: "anthropic",
  name: "Anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  models: [
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", contextWindow: "1M", capabilities: { vision: true } },
    { id: "claude-opus-4-7", name: "Claude Opus 4.7", contextWindow: "1M", capabilities: { vision: true } },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: "1M", capabilities: { vision: true } },
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", contextWindow: "200K", capabilities: { vision: true } },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", contextWindow: "200K", capabilities: { vision: true } },
  ],
  reasoning: ["low", "medium", "high", "xhigh", "max"],
};

