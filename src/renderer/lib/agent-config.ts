// Mirrors main/agents/ registry + per-agent config — renderer-side agent settings schema.
// When adding a new agent, mirror its settings definition here so the
// agent-settings UI can render the correct controls.
// See main/agents/ for the full integration checklist and per-agent configs.

export interface AgentSettingOption {
  id: string | null;
  name: string;
  desc?: string;
  /** Context window token capacity for this model (shown in ContextWindowIndicator) */
  contextWindow?: number;
}

export type AgentSettingType = "model" | "select" | "effort";

export interface AgentSetting {
  key: string;
  type: AgentSettingType;
  label: string;
  options?: AgentSettingOption[];
  levels?: string[];
}

export interface AgentUIConfig {
  id: string;
  name: string;
  disabled: boolean;
  settings: AgentSetting[];
}

export const AGENT_UI_CONFIGS: Record<string, AgentUIConfig> = {
  claude: {
    id: "claude",
    name: "Claude Code",
    disabled: false,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default", desc: "Use system Claude Code setting", contextWindow: 1_000_000 },
          { id: "sonnet", name: "Sonnet", desc: "Fast, efficient for most tasks", contextWindow: 1_000_000 },
          { id: "opus", name: "Opus", desc: "Most capable, complex reasoning", contextWindow: 1_000_000 },
          { id: "haiku", name: "Haiku", desc: "Fastest, simple tasks", contextWindow: 1_000_000 },
        ],
      },
      {
        key: "agentMode",
        type: "select",
        label: "Mode",
        options: [
          { id: "edit-before-ask", name: "Edit before ask" },
          { id: "auto-edit", name: "Auto edit" },
          { id: "plan", name: "Plan mode" },
        ],
      },
      {
        key: "effort",
        type: "effort",
        label: "Effort",
        levels: ["low", "medium", "high"],
      },
    ],
  },

  opencode: {
    id: "opencode",
    name: "OpenCode",
    disabled: true,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default", contextWindow: 128_000 },
          { id: "gpt-4o", name: "GPT-4o", desc: "Latest GPT-4 Omni", contextWindow: 128_000 },
          { id: "gpt-4-turbo", name: "GPT-4 Turbo", desc: "Fast GPT-4", contextWindow: 128_000 },
        ],
      },
      {
        key: "reasoning",
        type: "select",
        label: "Reasoning",
        options: [
          { id: "low", name: "Low" },
          { id: "medium", name: "Medium" },
          { id: "high", name: "High" },
        ],
      },
    ],
  },

  gemini: {
    id: "gemini",
    name: "Gemini CLI",
    disabled: true,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default", contextWindow: 1_000_000 },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Most capable", contextWindow: 1_000_000 },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Fast & efficient", contextWindow: 1_000_000 },
        ],
      },
      {
        key: "temperature",
        type: "select",
        label: "Style",
        options: [
          { id: "precise", name: "Precise" },
          { id: "balanced", name: "Balanced" },
          { id: "creative", name: "Creative" },
        ],
      },
    ],
  },

  qoder: {
    id: "qoder",
    name: "Qoder CLI",
    disabled: true,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default", contextWindow: 200_000 },
          { id: "llama-4", name: "Llama 4", desc: "Latest Meta model", contextWindow: 200_000 },
          { id: "mixtral", name: "Mixtral", desc: "Mixture of experts", contextWindow: 200_000 },
        ],
      },
    ],
  },
};

/** Get the context window capacity for a given agent + model.
 *  Reads from the agent's model options defined in AGENT_UI_CONFIGS. */
export function getContextWindowCapacity(agentId: string, model: string | null): number {
  const config = AGENT_UI_CONFIGS[agentId] ?? AGENT_UI_CONFIGS.claude;
  const modelSetting = config.settings.find((s) => s.key === "model");
  const modelId = model ?? null;
  const option = modelSetting?.options?.find((o) => o.id === modelId);
  return option?.contextWindow ?? 200_000;
}
