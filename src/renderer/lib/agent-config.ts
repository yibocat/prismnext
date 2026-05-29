// Mirrors main/agents/configs.ts — renderer-side agent settings schema.
// When adding a new agent, mirror its settings definition here so the
// agent-settings UI can render the correct controls.
// See main/agents/configs.ts for the full integration checklist.

export interface AgentSettingOption {
  id: string | null;
  name: string;
  desc?: string;
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
          { id: null, name: "Default", desc: "Use system Claude Code setting" },
          { id: "sonnet", name: "Sonnet", desc: "Fast, efficient for most tasks" },
          { id: "opus", name: "Opus", desc: "Most capable, complex reasoning" },
          { id: "haiku", name: "Haiku", desc: "Fastest, simple tasks" },
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
          { id: null, name: "Default" },
          { id: "gpt-4o", name: "GPT-4o", desc: "Latest GPT-4 Omni" },
          { id: "gpt-4-turbo", name: "GPT-4 Turbo", desc: "Fast GPT-4" },
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
          { id: null, name: "Default" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Most capable" },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Fast & efficient" },
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
          { id: null, name: "Default" },
          { id: "llama-4", name: "Llama 4", desc: "Latest Meta model" },
          { id: "mixtral", name: "Mixtral", desc: "Mixture of experts" },
        ],
      },
    ],
  },
};
