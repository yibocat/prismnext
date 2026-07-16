// src/renderer/lib/providers/types.ts

export interface ModelConfig {
  /** Model ID as passed to OpenCode, e.g. "claude-sonnet-4-5-20250929" */
  id: string;
  /** Human-readable name, e.g. "Claude Sonnet 4.5" */
  name: string;
  /** Context window size for display, e.g. "200K", "128K", "1M" */
  contextWindow: string;
  /** Input capabilities used for composer/media routing. */
  capabilities?: {
    /** Accepts image input directly (native vision / multimodal). */
    vision?: boolean;
  };
  /** Supported reasoning/thinking levels. If absent, provider defaults apply. */
  reasoning?: string[];
  /** Default reasoning level when this model is selected. */
  defaultReasoning?: string;
  /** Hide from Chat model dropdown (e.g. deprecated models still configurable in settings). */
  hidden?: boolean;
}

export interface ProviderConfig {
  /** Provider ID used in settings keys and ACP `provider/model` strings */
  id: string;
  /** Display name */
  name: string;
  /** Default API endpoint */
  defaultBaseUrl: string;
  /** Default model ID — used when user hasn't explicitly picked a model */
  defaultModel?: string;
  /** All models this provider supports */
  models: ModelConfig[];
  /** Default reasoning levels (used when model doesn't specify its own) */
  reasoning?: string[];
  /** Default reasoning level */
  defaultReasoning?: string;
}
