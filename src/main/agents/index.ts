// Agent module barrel — re-exports from the new per-agent architecture.
// See agents/registry.ts for the primary API.
// See agents/types.ts for the core interfaces.

export { getAgent, getAvailableAgents, getAllAgents, getDefaultAgentId } from "./registry";
export type { AgentIntegration, AgentSetting, AgentSettingOption, AgentSettingType, SessionInfo, SessionProvider } from "./types";
