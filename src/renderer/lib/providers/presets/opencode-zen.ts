import type { ProviderConfig } from "../types";

/**
 * OpenCode Zen — model list from OpenCode `models.json` cache at runtime.
 * Preset only holds provider metadata.
 *
 * Config ref: `opencode/<model-id>` (see https://opencode.ai/docs/zen/)
 * Effort / Edit: OpenCode catalog via effort-catalog IPC.
 */
export const opencodeZenPreset: ProviderConfig = {
  id: "opencode-zen",
  name: "OpenCode Zen",
  defaultBaseUrl: "https://opencode.ai/zen/v1",
  defaultModel: "claude-sonnet-4-6",
  models: [],
};
