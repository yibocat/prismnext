/**
 * state-project.ts — Project-level Team state (design 2026-08-10 §5.1.4).
 *
 * Persists `<projectRoot>/.workbench/agent/teams.json`: project default team +
 * team/asset tri-state overrides + project overrides. Per-project.
 *
 * Leftover paper-side `packs.json` / `.prismnext/agent/*` is not read (D-30).
 * A missing teams.json is an empty project state.
 *
 * Write rules: atomic write (tmp + rename) + write counter + change event
 * (each listener wrapped in try/catch). Project writes invalidate only their
 * own project view.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  PROJECT_TEAMS_STATE_REL,
  PROJECT_DEFAULT_TEAM_ID,
  LOCAL_TEAM_ID,
  type ProjectTeamsState,
  type Fqid,
  type AssetOverride,
} from "../../shared/teams/types";
import { emptyProjectTeamsState, normalizeProjectTeamsState } from "../../shared/teams/state";
import { isRemoteProjectRoot } from "../../shared/remote";
import { createLogger } from "../app/logger";

const log = createLogger("teams-state-project");

function statePath(projectRoot: string): string {
  return join(projectRoot, PROJECT_TEAMS_STATE_REL);
}

/** M10 also applies to a v2 state file written before the physical M8 move. */
function rewriteLegacyProjectLocalIdentity(state: ProjectTeamsState): ProjectTeamsState {
  const rewriteFqid = (fqid: string): string =>
    fqid.startsWith(`${LOCAL_TEAM_ID}:`)
      ? `${PROJECT_DEFAULT_TEAM_ID}:${fqid.slice(LOCAL_TEAM_ID.length + 1)}`
      : fqid;
  const rewriteTeamId = (teamId: string): string =>
    teamId === LOCAL_TEAM_ID ? PROJECT_DEFAULT_TEAM_ID : teamId;
  const rewriteRecord = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [rewriteFqid(key), value]));

  const rewritten: ProjectTeamsState = {
    ...state,
    defaultTeam: state.defaultTeam ? rewriteTeamId(state.defaultTeam) : undefined,
    teamEnabled: Object.fromEntries(
      Object.entries(state.teamEnabled).map(([teamId, value]) => [rewriteTeamId(teamId), value]),
    ),
    assetEnabled: rewriteRecord(state.assetEnabled),
    assetOverrides: rewriteRecord(state.assetOverrides),
  };

  return rewritten;
}

function hasLegacyProjectLocalIdentity(state: ProjectTeamsState): boolean {
  return state.defaultTeam === LOCAL_TEAM_ID
    || LOCAL_TEAM_ID in state.teamEnabled
    || Object.keys(state.assetEnabled).some((fqid) => fqid.startsWith(`${LOCAL_TEAM_ID}:`))
    || Object.keys(state.assetOverrides).some((fqid) => fqid.startsWith(`${LOCAL_TEAM_ID}:`));
}

/** Read project state. Missing or leftover paper-side files → empty. */
export function readProjectTeamsState(projectRoot: string): ProjectTeamsState {
  if (isRemoteProjectRoot(projectRoot)) return emptyProjectTeamsState();
  const path = statePath(projectRoot);
  if (existsSync(path)) {
    try {
      const state = normalizeProjectTeamsState(JSON.parse(readFileSync(path, "utf-8")));
      if (!hasLegacyProjectLocalIdentity(state)) return state;
      const rewritten = rewriteLegacyProjectLocalIdentity(state);
      writeProjectTeamsState(projectRoot, rewritten);
      log.info("M10: existing teams.json user.local identities rewritten", { projectRoot });
      return rewritten;
    } catch (err) {
      const empty = emptyProjectTeamsState();
      const backup = `${path}.corrupted.${Date.now()}`;
      try {
        renameSync(path, backup);
        writeProjectTeamsState(projectRoot, empty);
        log.error("teams.json corrupt; backed up and reset", {
          projectRoot,
          error: String(err),
          backup,
        });
      } catch (backupErr) {
        // Never overwrite an unreadable state file unless its backup succeeded.
        log.error("teams.json corrupt; backup failed", {
          projectRoot,
          error: String(err),
          backupError: String(backupErr),
        });
      }
      return empty;
    }
  }

  return emptyProjectTeamsState();
}

/** Atomic write (tmp + rename) + write counter + change event for this project. */
export function writeProjectTeamsState(projectRoot: string, state: ProjectTeamsState): ProjectTeamsState {
  if (isRemoteProjectRoot(projectRoot)) {
    throw new Error("Remote project team state is stored on the Host.");
  }
  const path = statePath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
  writeCounter += 1;
  for (const listener of writeListeners) {
    try {
      listener(projectRoot);
    } catch (err) {
      log.error("teams.json listener threw", { projectRoot, error: String(err) });
    }
  }
  return state;
}

// ── Write listeners (resolver invalidation for this project) ────────────────

type ProjectTeamsChangedListener = (projectRoot: string) => void;
const writeListeners = new Set<ProjectTeamsChangedListener>();
let writeCounter = 0;

/** Subscribe to project-state writes. */
export function onProjectTeamsStateWritten(
  listener: ProjectTeamsChangedListener,
): { dispose: () => void } {
  writeListeners.add(listener);
  return { dispose: () => writeListeners.delete(listener) };
}

/** Monotonic write counter — part of the resolver viewKey. */
export function projectTeamsStateWriteCounter(): number {
  return writeCounter;
}

/** File mtime (0 when absent) — part of the resolver viewKey. */
export function projectTeamsStateMtime(projectRoot: string): number {
  if (isRemoteProjectRoot(projectRoot)) return 0;
  try {
    return statSync(statePath(projectRoot)).mtimeMs;
  } catch {
    return 0;
  }
}

// ── Convenience writers (tri-state: true/false records, null deletes the key) ──

/** Set the project-level team tri-state. null = delete the key (fall back to app/default). */
export function setProjectTeamEnabled(
  projectRoot: string,
  teamId: string,
  value: boolean | null,
): ProjectTeamsState {
  const state = readProjectTeamsState(projectRoot);
  const teamEnabled = { ...state.teamEnabled };
  if (value === null) delete teamEnabled[teamId];
  else teamEnabled[teamId] = value;
  return writeProjectTeamsState(projectRoot, { ...state, teamEnabled });
}

/** Set the project-level asset tri-state. null = delete the key. */
export function setProjectAssetEnabled(
  projectRoot: string,
  fqid: Fqid,
  value: boolean | null,
): ProjectTeamsState {
  const state = readProjectTeamsState(projectRoot);
  const assetEnabled = { ...state.assetEnabled };
  if (value === null) delete assetEnabled[fqid];
  else assetEnabled[fqid] = value;
  return writeProjectTeamsState(projectRoot, { ...state, assetEnabled });
}

/** Write a project-level override (an all-undefined patch removes the key). */
export function saveProjectAssetOverride(
  projectRoot: string,
  fqid: Fqid,
  patch: AssetOverride,
): ProjectTeamsState {
  const state = readProjectTeamsState(projectRoot);
  const assetOverrides = { ...state.assetOverrides };
  const merged: AssetOverride = { ...assetOverrides[fqid], ...patch };
  const hasValue = Object.values(merged).some((v) => v !== undefined);
  if (hasValue) assetOverrides[fqid] = merged;
  else delete assetOverrides[fqid];
  return writeProjectTeamsState(projectRoot, { ...state, assetOverrides });
}

/** Set the project-level default (active) team. */
export function setProjectDefaultTeam(
  projectRoot: string,
  teamId: string | null,
): ProjectTeamsState {
  const state = readProjectTeamsState(projectRoot);
  return writeProjectTeamsState(projectRoot, { ...state, defaultTeam: teamId ?? undefined });
}
