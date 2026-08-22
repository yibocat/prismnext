import type { IconSpec } from "@shared/platform/icon-spec";
import type { AssetOverride } from "@shared/teams/types";
import { teamsDesktop } from "@/lib/desktop-api/teams";

export type TeamDetailSnapshot = {
  contents: Awaited<ReturnType<typeof teamsDesktop.teamsGetTeamContents>>;
  subagents: Awaited<ReturnType<typeof teamsDesktop.teamsListAssets>>;
  skills: Awaited<ReturnType<typeof teamsDesktop.teamsListAssets>>;
  commands: Awaited<ReturnType<typeof teamsDesktop.teamsListAssets>>;
  mcps: Awaited<ReturnType<typeof teamsDesktop.teamsListAssets>>;
  orchestrators: Awaited<ReturnType<typeof teamsDesktop.teamsListAssets>>;
  roster: Awaited<ReturnType<typeof teamsDesktop.teamsGetRoster>>;
  skillsRoster: Awaited<ReturnType<typeof teamsDesktop.teamsGetSkillsRoster>>;
  commandsRoster: Awaited<ReturnType<typeof teamsDesktop.teamsGetCommandsRoster>>;
};

export async function loadTeamDetail(
  projectRoot: string,
  teamId: string,
): Promise<TeamDetailSnapshot> {
  const [
    contents,
    subagents,
    skills,
    commands,
    mcps,
    orchestrators,
    roster,
    skillsRoster,
    commandsRoster,
  ] = await Promise.all([
    teamsDesktop.teamsGetTeamContents(teamId, projectRoot),
    teamsDesktop.teamsListAssets(projectRoot, "subagent"),
    teamsDesktop.teamsListAssets(projectRoot, "skill"),
    teamsDesktop.teamsListAssets(projectRoot, "command"),
    teamsDesktop.teamsListAssets(projectRoot, "mcp"),
    teamsDesktop.teamsListAssets(projectRoot, "orchestrator"),
    teamsDesktop.teamsGetRoster(projectRoot, teamId),
    teamsDesktop.teamsGetSkillsRoster(projectRoot, teamId),
    teamsDesktop.teamsGetCommandsRoster(projectRoot, teamId),
  ]);
  return {
    contents,
    subagents,
    skills,
    commands,
    mcps,
    orchestrators,
    roster,
    skillsRoster,
    commandsRoster,
  };
}

export function saveTeamAssetOverride(
  projectRoot: string,
  fqid: string,
  patch: AssetOverride,
  scope: "app" | "project" = "project",
) {
  return teamsDesktop.teamsSaveAssetOverride(projectRoot, fqid, patch, scope);
}

export function setTeamAssetEnabled(
  projectRoot: string,
  fqid: string,
  enabled: boolean | null,
  scope: "app" | "project" = "project",
) {
  return teamsDesktop.teamsSetAssetEnabled(projectRoot, fqid, enabled, scope);
}

export function updateTeamIcon(
  teamId: string,
  icon: IconSpec | null,
  projectRoot?: string | null,
) {
  return teamsDesktop.teamsUpdateIcon(teamId, icon, projectRoot);
}

export function setTeamIconImage(
  teamId: string,
  pngBase64: string,
  projectRoot?: string | null,
) {
  return teamsDesktop.teamsSetIconImage(teamId, pngBase64, projectRoot);
}

export function deleteTeam(teamId: string, projectRoot?: string) {
  return teamsDesktop.teamsDelete(teamId, projectRoot);
}

export function uninstallTeam(teamId: string) {
  return teamsDesktop.teamsUninstall(teamId);
}

export function installTeam(teamId: string) {
  return teamsDesktop.teamsInstall(teamId);
}

export function resetTeamProjectEnabled(projectRoot: string, teamId: string) {
  return teamsDesktop.teamsSetEnabled(projectRoot, teamId, null, "project");
}
