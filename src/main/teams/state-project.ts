/**
 * state-project.ts — Project-level Team state (design 2026-08-10 §5.1.4).
 *
 * Persists `<projectRoot>/.prismnext/agent/teams.json`: project default team +
 * team/asset tri-state overrides + project overrides. Per-project.
 *
 * T6: the read-time fallback is now a one-shot on-disk migration. When
 * teams.json does not exist but the legacy packs.json (or legacy agent state)
 * does, the legacy state is converted to the new schema AND written to
 * teams.json on disk. Subsequent reads find teams.json and skip the
 * migration. This replaces the T3/T4 read-only derivation.
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
import { hasLegacyAgentState, readTeamsState } from "../services/teams-state";
import { createLogger } from "../services/logger";

const log = createLogger("teams-state-project");

function statePath(projectRoot: string): string {
  return join(projectRoot, PROJECT_TEAMS_STATE_REL);
}

/**
 * T6 one-shot migration: convert the legacy packs.json (stateVersion 3) to
 * the new teams.json (version 1) and write it to disk. This runs once —
 * after teams.json exists, it's never called again.
 *
 * M4: projectPackStates[id].enabled=false → teamEnabled[id] = false
 * M5: disabledContent[] → assetEnabled[fqid] = false
 * M6: contentOverrides{} → assetOverrides{} (allowedExperts stays as-is on
 *     disk; the resolver reads it via the catalog's parseRoster)
 * M7: defaultOrchestrator (FQID) → defaultTeam (its teamId prefix)
 * M10: user.local: → project.local: FQID rewrite in all keys
 */
function migrateFromLegacyPacks(projectRoot: string): ProjectTeamsState {
  const old = readTeamsState(projectRoot);

  // M10: rewrite user.local: → project.local: in all FQID keys.
  const rewriteFqid = (fqid: string): string =>
    fqid.startsWith(`${LOCAL_TEAM_ID}:`)
      ? `${PROJECT_DEFAULT_TEAM_ID}:${fqid.slice(LOCAL_TEAM_ID.length + 1)}`
      : fqid;

  // M4: projectPackStates → teamEnabled (only records enabled=false).
  const teamEnabled: Record<string, boolean> = {};
  for (const [teamId, st] of Object.entries(old.projectPackStates)) {
    if (typeof st?.enabled === "boolean") teamEnabled[teamId] = st.enabled;
  }

  // M5: disabledContent → assetEnabled (all false).
  const assetEnabled: Record<string, boolean> = {};
  for (const fqid of old.disabledContent) {
    assetEnabled[rewriteFqid(fqid)] = false;
  }

  // M6: contentOverrides → assetOverrides (rewrite FQID keys).
  const assetOverrides: ProjectTeamsState["assetOverrides"] = {};
  for (const [fqid, ov] of Object.entries(old.contentOverrides)) {
    assetOverrides[rewriteFqid(fqid)] = ov;
  }

  // M7: defaultOrchestrator (FQID) → defaultTeam (teamId prefix).
  // M10: rewrite user.local → project.local in defaultTeam.
  let defaultTeam = old.defaultOrchestrator?.split(":")[0];
  if (defaultTeam === LOCAL_TEAM_ID) defaultTeam = PROJECT_DEFAULT_TEAM_ID;

  const newState: ProjectTeamsState = {
    version: 1,
    defaultTeam: defaultTeam || undefined,
    teamEnabled,
    assetEnabled,
    assetOverrides,
  };

  // Write to disk (atomic).
  writeProjectTeamsState(projectRoot, newState);
  log.info("T6 migration: packs.json → teams.json written", { projectRoot });

  return newState;
}

/** Read project state; teams.json → one-shot migration from legacy → empty. */
export function readProjectTeamsState(projectRoot: string): ProjectTeamsState {
  const path = statePath(projectRoot);
  if (existsSync(path)) {
    try {
      return normalizeProjectTeamsState(JSON.parse(readFileSync(path, "utf-8")));
    } catch (err) {
      log.error("teams.json corrupt, falling back to empty", { projectRoot, error: String(err) });
      return emptyProjectTeamsState();
    }
  }

  // T6 one-shot migration: teams.json doesn't exist yet. If the legacy
  // packs.json or legacy agent state exists, convert and write teams.json.
  const legacyPath = join(projectRoot, ".prismnext", "agent", "packs.json");
  if (existsSync(legacyPath) || hasLegacyAgentState(projectRoot)) {
    try {
      return migrateFromLegacyPacks(projectRoot);
    } catch (err) {
      log.error("T6 migration failed, falling back to empty", { projectRoot, error: String(err) });
      return emptyProjectTeamsState();
    }
  }

  return emptyProjectTeamsState();
}

/** Atomic write (tmp + rename) + write counter + change event for this project. */
export function writeProjectTeamsState(projectRoot: string, state: ProjectTeamsState): ProjectTeamsState {
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
