/**
 * packs-installed.ts —— App-level pack installation store (spec
 * 2026-08-09-pack-app-project-layering.md §4.1).
 *
 * "Is this pack installed on this machine?" has exactly one answer, stored in
 * userData (shared by all projects). Project-level enable/disable lives in
 * packs.json (projectPackStates), and core/local packs are implicitly
 * installed and never recorded here.
 *
 * File: `app.getPath("userData")/packs-installed.json`
 * Writes are atomic (tmp + rename), same pattern as packs-state.ts.
 */

import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "./logger";

const log = createLogger("packs-installed");

export const PACKS_INSTALLED_VERSION = 1;
export const PACKS_INSTALLED_FILE = "packs-installed.json";

export interface InstalledPackRecord {
  packId: string;
  /** ISO 8601 */
  installedAt: string;
}

interface PacksInstalledFile {
  version: typeof PACKS_INSTALLED_VERSION;
  installedPacks: InstalledPackRecord[];
}

/**
 * Test-injectable data dir (sealed fixture per test). Falls back to Electron
 * userData in the real app; in vitest (no `app`) the caller sets this.
 */
let dataDirOverride: string | null = null;

export function setPacksInstalledDataDir(dir: string | null): void {
  dataDirOverride = dir;
}

function filePath(): string {
  if (dataDirOverride) return join(dataDirOverride, PACKS_INSTALLED_FILE);
  try {
    return join(app.getPath("userData"), PACKS_INSTALLED_FILE);
  } catch {
    // Non-Electron context (vitest without mock) → throwaway tmp dir.
    return join(app_less_fallback(), PACKS_INSTALLED_FILE);
  }
}

function app_less_fallback(): string {
  // Cheap in-memory/tmp fallback when Electron's app is unavailable.
  return process.env.TMPDIR ?? "/tmp";
}

function empty(): PacksInstalledFile {
  return { version: PACKS_INSTALLED_VERSION, installedPacks: [] };
}

/** Read the app-level install file; missing/corrupt → empty (self-heal). */
function readFileState(): PacksInstalledFile {
  const path = filePath();
  if (!existsSync(path)) return empty();
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<PacksInstalledFile>;
    if (!raw || typeof raw !== "object") return empty();
    const list = Array.isArray(raw.installedPacks)
      ? raw.installedPacks.filter(
          (e): e is InstalledPackRecord =>
            Boolean(e) && typeof e.packId === "string" && Boolean(e.packId),
        )
      : [];
    return { version: PACKS_INSTALLED_VERSION, installedPacks: list };
  } catch (err) {
    log.error("packs-installed.json corrupt, falling back to empty", { error: String(err) });
    return empty();
  }
}

/** Atomic write: tmp + rename. */
function writeFileState(state: PacksInstalledFile): void {
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
  writeCounter += 1;
  for (const listener of writeListeners) listener();
}

// ── 写监听（resolver 视图失效用，见 pack-resolver.ts）──────

type InstalledChangedListener = () => void;
const writeListeners = new Set<InstalledChangedListener>();
let writeCounter = 0;

/** Subscribe to app-level install file writes (resolver invalidation). */
export function onPacksInstalledChanged(listener: InstalledChangedListener): { dispose: () => void } {
  writeListeners.add(listener);
  return { dispose: () => writeListeners.delete(listener) };
}

/** Monotonic write counter — part of the resolver view key. */
export function packsInstalledWriteCounter(): number {
  return writeCounter;
}

/** All app-level installed packs (non-core, non-local). */
export function listInstalledPacks(): InstalledPackRecord[] {
  return readFileState().installedPacks;
}

/** True iff `packId` is recorded at app level. */
export function isPackInstalled(packId: string): boolean {
  return listInstalledPacks().some((r) => r.packId === packId);
}

/** Record an installation (idempotent: already installed → no-op). */
export function addInstalledPack(packId: string): void {
  const state = readFileState();
  if (state.installedPacks.some((r) => r.packId === packId)) return;
  state.installedPacks.push({ packId, installedAt: new Date().toISOString() });
  writeFileState(state);
  log.info("pack installed (app-level)", { packId });
}

/** Remove an installation record (idempotent). */
export function removeInstalledPack(packId: string): void {
  const state = readFileState();
  const next = state.installedPacks.filter((r) => r.packId !== packId);
  if (next.length === state.installedPacks.length) return;
  writeFileState({ ...state, installedPacks: next });
  log.info("pack uninstalled (app-level)", { packId });
}

/** Merge records (used by migration M1: upsert project packs into app store). */
export function upsertInstalledPacks(records: Array<{ packId: string; installedAt?: string }>): void {
  const state = readFileState();
  const byId = new Map(state.installedPacks.map((r) => [r.packId, r]));
  for (const rec of records) {
    if (!byId.has(rec.packId)) {
      byId.set(rec.packId, { packId: rec.packId, installedAt: rec.installedAt ?? new Date().toISOString() });
    }
  }
  const next: PacksInstalledFile = {
    version: PACKS_INSTALLED_VERSION,
    installedPacks: [...byId.values()],
  };
  if (next.installedPacks.length !== state.installedPacks.length) writeFileState(next);
}
