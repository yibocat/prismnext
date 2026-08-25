/**
 * Pi provider catalog — the single source of truth for providers supported by the Pi engine.
 *
 * Migration state: PrismNext product provider ids ARE Pi provider ids after the
 * OpenCode → Pi migration. Legacy Prism ids (opencode-zen, zhipu, kimi, alibaba, …)
 * map to their Pi equivalents via LEGACY_PROVIDER_ID_MAP during one-shot settings
 * migration (see settings-store migrate step).
 *
 * Model lists are NOT stored here — every provider's models come from the Pi
 * ModelRuntime catalog at runtime (`agent:listModels`).
 */

export interface PiProviderMeta {
  id: string;
  name: string;
  baseUrl?: string;
  /** True when auth is ambient (env vars / OAuth / cloud profiles), not a simple API key. */
  keyless?: boolean;
  /** Notes shown to users in Settings (e.g. regional variants). */
  notes?: string;
}

/** Built-in Pi providers, mirrors @earendil-works/pi-ai/dist/providers. */
export const PI_PROVIDERS: readonly PiProviderMeta[] = [
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "google", name: "Google", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "xai", name: "xAI", baseUrl: "https://api.x.ai/v1" },
  { id: "nvidia", name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "cerebras", name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1" },
  { id: "together", name: "Together", baseUrl: "https://api.together.ai/v1" },
  { id: "baseten", name: "Baseten", baseUrl: "https://inference.baseten.co/v1" },
  { id: "fireworks", name: "Fireworks", baseUrl: "https://api.fireworks.ai/inference" },
  { id: "huggingface", name: "Hugging Face", baseUrl: "https://router.huggingface.co/v1" },
  { id: "openai-codex", name: "OpenAI Codex", baseUrl: "https://chatgpt.com/backend-api" },
  { id: "github-copilot", name: "GitHub Copilot", baseUrl: "https://api.individual.githubcopilot.com", keyless: true },
  { id: "zai", name: "Z.AI", baseUrl: "https://api.z.ai/api/coding/paas/v4" },
  { id: "zai-coding-cn", name: "Z.AI Coding CN", baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4" },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.io/anthropic" },
  { id: "minimax-cn", name: "MiniMax CN", baseUrl: "https://api.minimaxi.com/anthropic" },
  { id: "moonshotai", name: "Moonshot AI", baseUrl: "https://api.moonshot.ai/v1" },
  { id: "moonshotai-cn", name: "Moonshot AI CN", baseUrl: "https://api.moonshot.cn/v1" },
  { id: "kimi-coding", name: "Kimi For Coding", baseUrl: "https://api.kimi.com/coding" },
  { id: "qwen-token-plan", name: "Qwen Token Plan", baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1" },
  { id: "qwen-token-plan-cn", name: "Qwen Token Plan CN", baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1" },
  { id: "qwen-token-plan-individual", name: "Qwen Token Plan Individual", baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1" },
  { id: "xiaomi", name: "Xiaomi", baseUrl: "https://api.xiaomimimo.com/v1" },
  { id: "xiaomi-token-plan-ams", name: "Xiaomi Token Plan AMS", baseUrl: "https://token-plan-ams.xiaomimimo.com/v1" },
  { id: "xiaomi-token-plan-cn", name: "Xiaomi Token Plan CN", baseUrl: "https://token-plan-cn.xiaomimimo.com/v1" },
  { id: "xiaomi-token-plan-sgp", name: "Xiaomi Token Plan SGP", baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1" },
  { id: "ant-ling", name: "Ant Ling", baseUrl: "https://api.ant-ling.com/v1" },
  { id: "opencode", name: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1" },
  { id: "opencode-go", name: "OpenCode Go", baseUrl: "https://opencode.ai/zen/go/v1" },
  { id: "amazon-bedrock", name: "Amazon Bedrock", keyless: true, notes: "Uses AWS credentials or bearer token." },
  { id: "azure-openai-responses", name: "Azure OpenAI", keyless: true, notes: "Azure OpenAI responses API." },
  { id: "google-vertex", name: "Google Vertex", keyless: true, notes: "Uses Google Cloud credentials." },
  { id: "cloudflare-ai-gateway", name: "Cloudflare AI Gateway", keyless: true },
  { id: "cloudflare-workers-ai", name: "Cloudflare Workers AI", keyless: true },
  { id: "vercel-ai-gateway", name: "Vercel AI Gateway", baseUrl: "https://ai-gateway.vercel.sh" },
];

/** Product-facing preset providers shown in Settings → Add Provider. */
export const PI_PRESET_PROVIDERS: readonly PiProviderMeta[] = PI_PROVIDERS.filter(
  (p) => !p.keyless,
);

/** Legacy Prism provider ids → Pi provider ids (one-shot settings migration). */
export const LEGACY_PROVIDER_ID_MAP: Record<string, string> = {
  "opencode-zen": "opencode",
  zhipu: "zai-coding-cn",
  kimi: "moonshotai",
  alibaba: "qwen-token-plan-cn",
  minimax: "minimax",
};

/** Provider ids whose model lists come from the Pi ModelRuntime catalog at runtime. */
export function isPiProviderId(providerId: string): boolean {
  return PI_PROVIDERS.some((p) => p.id === providerId);
}

/** Map a legacy Prism provider id to its Pi id; unknown ids pass through unchanged. */
export function migrateProviderIdToPi(providerId: string): string {
  return LEGACY_PROVIDER_ID_MAP[providerId.trim()] ?? providerId.trim();
}

export function piProviderMeta(providerId: string): PiProviderMeta | undefined {
  return PI_PROVIDERS.find((p) => p.id === providerId);
}

export function piProviderName(providerId: string): string {
  return piProviderMeta(providerId)?.name ?? providerId;
}

export function piProviderBaseUrl(providerId: string): string | undefined {
  return piProviderMeta(providerId)?.baseUrl;
}

/** Settings key for per-model effort: `providerId/modelId`. */
export function modelEffortKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId.trim()}`;
}
