/**
 * Remote project `teams.json` — Host fs only.
 * Laptop catalog decides which teams exist; this file only stores the active id.
 */
import { posix } from "node:path";
import { parseRemoteAbs, RemoteOperationError } from "../../shared/remote";
import { PROJECT_TEAMS_STATE_REL } from "../../shared/teams/types";
import {
  projectDefaultTeamFromRaw,
  projectTeamsStateWithDefaultTeam,
} from "../../shared/teams/state";
import { getRemoteSessionBroker } from "../ipc/remote";

function stateAbs(projectRoot: string): { profileId: string; absPath: string } {
  const parsed = parseRemoteAbs(projectRoot);
  if (!parsed) throw new Error("Not a remote project root");
  return {
    profileId: parsed.profileId,
    absPath: posix.join(parsed.abs, PROJECT_TEAMS_STATE_REL),
  };
}

export async function readRemoteProjectDefaultTeam(projectRoot: string): Promise<string | null> {
  const { profileId, absPath } = stateAbs(projectRoot);
  const broker = getRemoteSessionBroker();
  if (!broker.isBound(profileId)) return null;
  const result = await broker.invoke(profileId, "fs:read", { absPath }) as {
    content?: string;
    missing?: boolean;
  };
  return projectDefaultTeamFromRaw(result.missing ? null : result.content);
}

export async function writeRemoteProjectDefaultTeam(
  projectRoot: string,
  teamId: string,
): Promise<void> {
  const { profileId, absPath } = stateAbs(projectRoot);
  const broker = getRemoteSessionBroker();
  if (!broker.isBound(profileId)) {
    throw new RemoteOperationError("not_connected", "Not connected.");
  }
  const result = await broker.invoke(profileId, "fs:read", { absPath }) as {
    content?: string;
    missing?: boolean;
  };
  const content = projectTeamsStateWithDefaultTeam(result.missing ? null : result.content, teamId);
  await broker.invoke(profileId, "fs:write", { absPath, content });
}
