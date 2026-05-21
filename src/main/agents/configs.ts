// ─── Agent Config Types ───

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  binary: string;
  args: string[];
  env?: Record<string, string>;
  placeholder: boolean;
}

// ─── Agent Registry ───

export const AGENTS: Record<string, AgentConfig> = {
  claude: {
    id: "claude",
    name: "Claude Code",
    description: "Anthropic Claude via ACP wrapper",
    binary: "npx",
    args: ["@agentclientprotocol/claude-agent-acp", "--stdio"],
    placeholder: false,
  },

  opencode: {
    id: "opencode",
    name: "OpenCode",
    description: "OpenCode CLI via ACP",
    binary: "npx",
    args: ["opencode", "acp", "--stdio"],
    placeholder: true,
  },

  gemini: {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google Gemini via ACP",
    binary: "gemini",
    args: ["--acp", "--stdio"],
    placeholder: true,
  },

  qoder: {
    id: "qoder",
    name: "Qoder CLI",
    description: "Qoder via ACP",
    binary: "qoder",
    args: ["acp", "--stdio"],
    placeholder: true,
  },
};

export const DEFAULT_AGENT_ID = "claude";

export function getAgentConfig(id: string): AgentConfig | undefined {
  return AGENTS[id];
}

export function getAvailableAgents(): AgentConfig[] {
  return Object.values(AGENTS).filter((a) => !a.placeholder);
}

export function getAllAgents(): AgentConfig[] {
  return Object.values(AGENTS);
}
