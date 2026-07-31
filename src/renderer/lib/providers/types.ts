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
  /**
   * Hover blurb from OpenCode catalog `description` when synced.
   * Optional override: i18n `chat.model.desc.<providerId>.<modelId>`.
   */
  description?: string;
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
}
