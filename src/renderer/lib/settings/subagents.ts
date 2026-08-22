import type {
  SaveCustomOrchestratorPayload,
  SaveCustomSubagentPayload,
} from "@shared/agent/subagents";
import type { AssetOverride } from "@shared/teams/types";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { teamsDesktop } from "@/lib/desktop-api/teams";

export type ProjectSubagent = Awaited<
  ReturnType<typeof agentDesktop.subagentsList>
>[number];

export async function listProjectSubagents(
  projectRoot: string,
): Promise<ProjectSubagent[]> {
  try {
    return await agentDesktop.subagentsList(projectRoot);
  } catch {
    return [];
  }
}

export async function getSubagentDetail(projectRoot: string, subagentId: string) {
  return agentDesktop.subagentsGetDetail(projectRoot, subagentId);
}

export async function saveCustomSubagent(
  projectRoot: string,
  payload: SaveCustomSubagentPayload,
  targetTeamId?: string,
) {
  return agentDesktop.subagentsSaveCustom(projectRoot, payload, targetTeamId);
}

export async function listSubagentRosterReferrers(
  projectRoot: string,
  subagentId: string,
) {
  return agentDesktop.subagentsListRosterReferrers(projectRoot, subagentId);
}

export async function deleteCustomSubagent(projectRoot: string, subagentId: string) {
  return agentDesktop.subagentsDeleteCustom(projectRoot, subagentId);
}

export async function saveSubagentAssetOverride(
  projectRoot: string,
  fqid: string,
  patch: AssetOverride,
) {
  return teamsDesktop.teamsSaveAssetOverride(projectRoot, fqid, patch);
}

export async function getOrchestratorDetail(
  projectRoot: string,
  orchestratorId: string,
) {
  return agentDesktop.orchestratorsGetDetail(projectRoot, orchestratorId);
}

export async function saveCustomOrchestrator(
  projectRoot: string,
  payload: SaveCustomOrchestratorPayload,
  targetTeamId?: string,
) {
  return agentDesktop.orchestratorsSaveCustom(projectRoot, payload, targetTeamId);
}
