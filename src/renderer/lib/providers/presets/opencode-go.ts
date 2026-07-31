import type { ProviderConfig } from "../types";

/**
 * OpenCode Go — model list comes from OpenCode `models.json` cache at runtime
 * (`chat:getOpenCodeModelsCatalog`). Preset only holds provider metadata.
 *
 * Config ref: `opencode-go/<model-id>` (see https://opencode.ai/docs/go/)
 * Effort / Edit: OpenCode catalog (`reasoning_options`) via effort-catalog IPC.
 * Hover blurbs: optional i18n `chat.model.desc.opencode-go.<id>`, else catalog `description`.
 */
export const opencodeGoPreset: ProviderConfig = {
  id: "opencode-go",
  name: "OpenCode Go",
  defaultBaseUrl: "https://opencode.ai/zen/go/v1",
  defaultModel: "glm-5.1",
  models: [],
};
