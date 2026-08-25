import type {
  AgentListModelsInput,
  AgentTestConnectionInput,
} from "@shared/agent/api";
import { agentDesktop } from "@/lib/desktop-api/agent";

export async function testProviderConnection(input: AgentTestConnectionInput) {
  return agentDesktop.agentTestConnection(input);
}

export async function listProviderModels(input: AgentListModelsInput) {
  return agentDesktop.agentListModels(input);
}
