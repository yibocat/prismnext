/**
 * Resolve writable-team mcp.json paths (Common / Project / user-created).
 * Pack teams are read-only — callers must not write those paths via this helper.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  isProjectLocalTeamId,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
} from "../../shared/teams/types";
import { getTeamRecord } from "../teams/catalog";
import { ensureMyContentTeam } from "../teams/my-content";
import { ensureProjectDefaultTeamDir } from "../teams/migrate-project-content";

export function resolveWritableTeamDir(projectRoot: string, teamId: string): string {
  const tid = teamId.trim() || PROJECT_DEFAULT_TEAM_ID;
  if (tid === MY_CONTENT_TEAM_ID) {
    return ensureMyContentTeam().dir;
  }
  if (tid === PROJECT_DEFAULT_TEAM_ID || isProjectLocalTeamId(tid)) {
    return ensureProjectDefaultTeamDir(projectRoot);
  }
  const record = getTeamRecord(tid, [projectRoot]);
  if (!record) throw new Error(`Target team not found: ${tid}`);
  if (!record.writable) throw new Error(`Target team is read-only: ${tid}`);
  return record.dir;
}

export function resolveWritableTeamMcpPath(projectRoot: string, teamId: string): string {
  return join(resolveWritableTeamDir(projectRoot, teamId), "mcp.json");
}

export function readWritableTeamMcpJson(projectRoot: string, teamId: string): string {
  const path = resolveWritableTeamMcpPath(projectRoot, teamId);
  if (!existsSync(path)) return "[]\n";
  return readFileSync(path, "utf-8");
}

export function writeWritableTeamMcpJson(
  projectRoot: string,
  teamId: string,
  content: string,
): string {
  const path = resolveWritableTeamMcpPath(projectRoot, teamId);
  mkdirSync(dirname(path), { recursive: true });
  const trimmed = content.trim() ? content : "[]\n";
  writeFileSync(path, trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`, "utf-8");
  return path;
}
