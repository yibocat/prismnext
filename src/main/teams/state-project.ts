/**
 * state-project.ts — Project-level Team state (design 2026-08-10 §5.1.4).
 *
 * Persists `<projectRoot>/.prismnext/agent/teams.json`: project default team +
 * team/asset tri-state overrides + project overrides. Per-project.
 *
 * T1 is a pure read/write layer: nothing consumes it yet. The T2 TeamResolver
 * reads it; the T6 migration moves packs.json content into it.
 *
 * Write rules: atomic write (tmp + rename) + write counter + change event
 * (each listener wrapped in try/catch). Project writes invalidate only their
 * own project view.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  PROJECT_TEAMS_STATE_REL,
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
 * Read-time fallback (decided for T3): when teams.json does not exist yet,
 * derive the project state from the legacy packs.json so existing projects keep
 * their enable/disable state after the T3 switch. Read-only — never writes.
 * The T6 migration moves packs.json → teams.json on disk and removes this.
 */
function deriveFromLegacyPacks(projectRoot: string): ProjectTeamsState | null {
  // Trigger when packs.json exists OR when legacy content (skills/ etc.) exists
  // without packs.json — readTeamsState runs the legacy migration (R6 etc.) in
  // both cases, and the migration is what moves legacy dirs into the Local Pack.
  const legacyPath = join(projectRoot, ".prismnext", "agent", "packs.json");
  if (!existsSync(legacyPath) && !hasLegacyAgentState(projectRoot)) return null;
  try {
    // Static import (a dynamic require() is undefined under vitest ESM). The new
    // layer reads the legacy store; removed in T6.
    const old = readTeamsState(projectRoot);
    const teamEnabled: Record<string, boolean> = {};
    for (const [teamId, st] of Object.entries(old.projectPackStates)) {
      if (typeof st?.enabled === "boolean") teamEnabled[teamId] = st.enabled;
    }
    // The legacy Local Pack keeps its user.local id across the T3/T4 switch
    // (the project.local rename is T6 / M10), so FQID prefixes pass through
    // unchanged and the legacy packs.json state stays consistent.
    const assetEnabled: Record<string, boolean> = {};
    for (const fqid of old.disabledContent) assetEnabled[fqid] = false;
    const assetOverrides: ProjectTeamsState["assetOverrides"] = { ...old.contentOverrides };
    // defaultOrchestrator (an orchestrator FQID) → defaultTeam (its teamId).
    const defaultTeam = old.defaultOrchestrator?.split(":")[0];
    return {
      version: 1,
      defaultTeam: defaultTeam || undefined,
      teamEnabled,
      assetEnabled,
      assetOverrides,
    };
  } catch (err) {
    log.error("legacy packs.json fallback failed", { projectRoot, error: String(err) });
    return null;
  }
}

/** Read project state; teams.json → legacy packs.json fallback → empty. */
export function readProjectTeamsState(projectRoot: string): ProjectTeamsState {
  const path = statePath(projectRoot);
  if (!existsSync(path)) {
    return deriveFromLegacyPacks(projectRoot) ?? emptyProjectTeamsState();
  }
  try {
    return normalizeProjectTeamsState(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    log.error("teams.json corrupt, falling back to empty", { projectRoot, error: String(err) });
    return emptyProjectTeamsState();
  }
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
