/**
 * Live Pi system-prompt join — the only order the model sees at session start.
 * Settings preview and AgentService must both call this.
 *
 * Per-turn blocks (project rules, Plan appendix) are NOT here.
 */

import { HOST_SYSTEM_IDENTITY } from "./host";

export interface AgentSystemPromptInput {
  stableSystem: string;
  agentsMd?: string;
  leadInstructions?: string;
  leadName?: string;
  /** Built-in profile modules — never written into Team files. */
  profileModules?: string;
  taskRoster?: string;
}

export interface AgentSystemPromptParts {
  hostIdentity: string;
  stableSystem: string;
  agentsMd: string;
  leadSection: string;
  profileModules: string;
  taskRoster: string;
}

export function formatLeadAgentSection(
  leadName: string | undefined,
  leadInstructions: string | undefined,
): string {
  const text = leadInstructions?.trim();
  if (!text) return "";
  return `## Active Team Lead: ${leadName || "Lead"}\n\n${text}`;
}

export function buildAgentSystemPromptParts(
  input: AgentSystemPromptInput,
): AgentSystemPromptParts {
  return {
    hostIdentity: HOST_SYSTEM_IDENTITY.trim(),
    stableSystem: input.stableSystem.trim(),
    agentsMd: input.agentsMd?.trim() ?? "",
    leadSection: formatLeadAgentSection(input.leadName, input.leadInstructions),
    profileModules: input.profileModules?.trim() ?? "",
    taskRoster: input.taskRoster?.trim() ?? "",
  };
}

/** Join order = live Pi system prompt. Empty parts are dropped. */
export function joinAgentSystemPromptParts(parts: AgentSystemPromptParts): string {
  return [
    parts.hostIdentity,
    parts.stableSystem,
    parts.agentsMd,
    parts.leadSection,
    parts.profileModules,
    parts.taskRoster,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function assembleAgentSystemPrompt(input: AgentSystemPromptInput): string {
  return joinAgentSystemPromptParts(buildAgentSystemPromptParts(input));
}
