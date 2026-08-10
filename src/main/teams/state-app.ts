/**
 * state-app.ts — App-level Team state (design 2026-08-10 §5.1.3).
 *
 * Persists `<userData>/teams-state.json`: install records + app-level default
 * team + team/asset tri-state overrides + global overrides. Shared by all projects.
 *
 * T6: the read-time fallback is now a one-shot on-disk migration. When
 * teams-state.json does not exist but packs-installed.json does, the
 * install records are copied to teams-state.json and written to disk.
 * Subsequent reads find teams-state.json and skip the migration.
 *
 * Write rules: atomic write (tmp + rename) + write counter + change event
 * (each listener wrapped in try/catch).
 */

import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  APP_TEAMS_STATE_FILE,
  type AppTeamsState,
  type Fqid,
  type AssetOverride,
} from "../../shared/teams/types";
import { emptyAppTeamsState, normalizeAppTeamsState } from "../../shared/teams/state";
import { listInstalledTeams } from "../services/teams-installed";
import { createLogger } from "../services/logger";

const log = createLogger("teams-state-app");

/** Test-injectable data dir (sealed fixture in vitest); the real app uses userData. */
let dataDirOverride: string | null = null;

export function setAppTeamsStateDataDir(dir: string | null): void {
  dataDirOverride = dir;
}

function filePath(): string {
  if (dataDirOverride) return join(dataDirOverride, APP_TEAMS_STATE_FILE);
  try {
    return join(app.getPath("userData"), APP_TEAMS_STATE_FILE);
  } catch {
    return join(process.env.TMPDIR ?? "/tmp", APP_TEAMS_STATE_FILE);
  }
}

/**
 * T6 one-shot migration (M1): copy install records from the legacy
 * packs-installed.json to the new teams-state.json and write to disk.
 * This runs once — after teams-state.json exists, it's never called again.
 */
function migrateFromLegacyInstalled(): AppTeamsState {
  const list = listInstalledTeams();
  const state: AppTeamsState = {
    ...emptyAppTeamsState(),
    installed: list.map((r) => ({ teamId: r.teamId, installedAt: r.installedAt })),
  };
  writeAppTeamsState(state);
  log.info("T6 migration: packs-installed.json → teams-state.json written", {
    count: state.installed.length,
  });
  return state;
}

/** Read app state; teams-state.json → one-shot migration from legacy → empty. */
export function readAppTeamsState(): AppTeamsState {
  const path = filePath();
  if (existsSync(path)) {
    try {
      return normalizeAppTeamsState(JSON.parse(readFileSync(path, "utf-8")));
    } catch (err) {
      log.error("teams-state.json corrupt, falling back to empty", { error: String(err) });
      return emptyAppTeamsState();
    }
  }

  // T6 one-shot migration: teams-state.json doesn't exist. If the legacy
  // packs-installed.json has records, copy them and write teams-state.json.
  try {
    const legacyList = listInstalledTeams();
    if (legacyList.length > 0) {
      return migrateFromLegacyInstalled();
    }
  } catch {
    // Legacy store not available — empty state.
  }

  return emptyAppTeamsState();
}

/** Atomic write (tmp + rename) + write counter + change event. */
export function writeAppTeamsState(state: AppTeamsState): void {
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
  writeCounter += 1;
  for (const listener of writeListeners) {
    try {
      listener();
    } catch (err) {
      log.error("teams-state.json listener threw", { error: String(err) });
    }
  }
}

// ── Write listeners (resolver invalidation across all projects) ─────────────

type AppTeamsChangedListener = () => void;
const writeListeners = new Set<AppTeamsChangedListener>();
let writeCounter = 0;

/** Subscribe to app-state writes (app-level change → invalidate all project views). */
export function onAppTeamsStateWritten(listener: AppTeamsChangedListener): { dispose: () => void } {
  writeListeners.add(listener);
  return { dispose: () => writeListeners.delete(listener) };
}

/** Monotonic write counter — part of the resolver viewKey. */
export function appTeamsStateWriteCounter(): number {
  return writeCounter;
}

// ── Convenience writers (tri-state: true/false records, null deletes the key) ──

/** Set the app-level team tri-state. null = delete the key (fall back to default true). */
export function setAppTeamEnabled(teamId: string, value: boolean | null): AppTeamsState {
  const state = readAppTeamsState();
  const teamEnabled = { ...state.teamEnabled };
  if (value === null) delete teamEnabled[teamId];
  else teamEnabled[teamId] = value;
  const next = { ...state, teamEnabled };
  writeAppTeamsState(next);
  return next;
}

/** Set the app-level asset tri-state. null = delete the key. */
export function setAppAssetEnabled(fqid: Fqid, value: boolean | null): AppTeamsState {
  const state = readAppTeamsState();
  const assetEnabled = { ...state.assetEnabled };
  if (value === null) delete assetEnabled[fqid];
  else assetEnabled[fqid] = value;
  const next = { ...state, assetEnabled };
  writeAppTeamsState(next);
  return next;
}

/** Write an app-level override (an all-undefined patch removes the key). */
export function saveAppAssetOverride(fqid: Fqid, patch: AssetOverride): AppTeamsState {
  const state = readAppTeamsState();
  const assetOverrides = { ...state.assetOverrides };
  const merged: AssetOverride = { ...assetOverrides[fqid], ...patch };
  const hasValue = Object.values(merged).some((v) => v !== undefined);
  if (hasValue) assetOverrides[fqid] = merged;
  else delete assetOverrides[fqid];
  const next = { ...state, assetOverrides };
  writeAppTeamsState(next);
  return next;
}

/** Set the app-level default (active) team. */
export function setAppDefaultTeam(teamId: string | null): AppTeamsState {
  const state = readAppTeamsState();
  const next = { ...state, defaultTeam: teamId ?? undefined };
  writeAppTeamsState(next);
  return next;
}
