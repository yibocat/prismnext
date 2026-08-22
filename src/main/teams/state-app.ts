/**
 * state-app.ts — App-level Team state (design 2026-08-10 §5.1.3).
 *
 * Persists `~/.prismnext/teams-state.json`: install records + workbench-wide
 * default team + team/asset tri-state overrides. Shared by all projects.
 *
 * Write rules: atomic write (tmp + rename) + write counter + change event
 * (each listener wrapped in try/catch).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  APP_TEAMS_STATE_FILE,
  type AppTeamsState,
  type Fqid,
  type AssetOverride,
} from "../../shared/teams/types";
import { emptyAppTeamsState, normalizeAppTeamsState } from "../../shared/teams/state";
import { createLogger } from "../app/logger";
import { listInstalledTeams } from "./teams-installed";
import { homeTeamsStatePath } from "../workbench/home";

const log = createLogger("teams-state-app");

/** Test-injectable data dir (sealed fixture in vitest); the real app uses userData. */
let dataDirOverride: string | null = null;

export function setAppTeamsStateDataDir(dir: string | null): void {
  dataDirOverride = dir;
}

function filePath(): string {
  if (dataDirOverride) return join(dataDirOverride, APP_TEAMS_STATE_FILE);
  return homeTeamsStatePath();
}

/** Read workbench team state. Missing or unreadable → empty (no legacy copy). */
export function readAppTeamsState(): AppTeamsState {
  const path = filePath();
  if (existsSync(path)) {
    try {
      return normalizeAppTeamsState(JSON.parse(readFileSync(path, "utf-8")));
    } catch (err) {
      const empty = emptyAppTeamsState();
      const backup = `${path}.corrupted.${Date.now()}`;
      try {
        renameSync(path, backup);
        writeAppTeamsState(empty);
        log.error("teams-state.json corrupt; backed up and reset", {
          error: String(err),
          backup,
        });
      } catch (backupErr) {
        // Never overwrite an unreadable state file unless its backup succeeded.
        log.error("teams-state.json corrupt; backup failed", {
          error: String(err),
          backupError: String(backupErr),
        });
      }
      return empty;
    }
  }

  const empty = emptyAppTeamsState();
  try {
    const list = listInstalledTeams();
    if (list.length > 0) {
      return {
        ...empty,
        installed: list.map((r) => ({ teamId: r.teamId, installedAt: r.installedAt })),
      };
    }
  } catch {
    // Install store unavailable — empty state.
  }
  return empty;
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
