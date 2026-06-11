// src/main/agents/registry.ts
import type { AgentIntegration } from "./types";
import { claudeAgent } from "./claude/config";
import { opencodeAgent } from "./opencode/config";
import { geminiAgent } from "./gemini/config";
import { qoderAgent } from "./qoder/config";

const REGISTRY: Record<string, AgentIntegration> = {
  claude: claudeAgent,
  opencode: opencodeAgent,
  gemini: geminiAgent,
  qoder: qoderAgent,
};

export function getAgent(id: string): AgentIntegration | undefined {
  return REGISTRY[id];
}

export function getAvailableAgents(): AgentIntegration[] {
  return Object.values(REGISTRY).filter((a) => !a.placeholder);
}

export function getAllAgents(): AgentIntegration[] {
  return Object.values(REGISTRY);
}

export function getDefaultAgentId(): string {
  return "claude";
}
