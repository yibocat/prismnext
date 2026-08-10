/**
 * M2 application-level user Team migration.
 *
 * Legacy user-packs are app-wide, while M8/M11 are per-project migrations;
 * keeping this boundary separate prevents either path from creating a second
 * writable home for user-created Teams.
 */
import { app } from "electron";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { appTeamsDir } from "./scope";
import { USER_TEAM_PUBLISHER } from "../../shared/teams/types";
import { createLogger } from "../services/logger";

const log = createLogger("teams-migrate-user", "agent");
const USER_PACKS_REL = "user-packs";

export interface UserTeamsMigrationOptions {
  legacyRoot: string;
  teamsRoot: string;
  backupRoot?: string;
}

export interface UserTeamsMigrationResult {
  moved: string[];
  conflicts: string[];
}

function legacyUserTeamsDir(): string {
  try {
    return join(app.getPath("userData"), USER_PACKS_REL);
  } catch {
    return join(process.env.TMPDIR ?? "/tmp", USER_PACKS_REL);
  }
}

function movePath(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  try {
    renameSync(source, destination);
  } catch {
    cpSync(source, destination, { recursive: true });
    rmSync(source, { recursive: true, force: true });
  }
}

function uniqueDestination(base: string): string {
  if (!existsSync(base)) return base;
  let index = 1;
  while (existsSync(`${base}.${index}`)) index++;
  return `${base}.${index}`;
}

function moveToBackup(source: string, backupRoot: string, teamId: string): void {
  movePath(source, uniqueDestination(join(backupRoot, teamId)));
}

function fileTreeSignature(root: string): string {
  const entries: string[] = [];
  const visit = (dir: string, relative: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      const rel = join(relative, entry.name);
      if (entry.isDirectory()) {
        entries.push(`d:${rel}`);
        visit(abs, rel);
      } else {
        const stat = statSync(abs);
        entries.push(`f:${rel}:${stat.size}:${readFileSync(abs).toString("base64")}`);
      }
    }
  };
  visit(root, "");
  return entries.join("|");
}

function upgradeManifest(teamDir: string, manifest: Record<string, unknown>): void {
  const pluginPath = join(teamDir, "plugin.json");
  const teamPath = join(teamDir, "team.json");
  const upgraded = { ...manifest, formatVersion: 2 };
  delete upgraded.contents;
  writeFileSync(teamPath, `${JSON.stringify(upgraded, null, 2)}\n`, "utf-8");
  if (pluginPath !== teamPath && existsSync(pluginPath)) rmSync(pluginPath, { force: true });
}

/**
 * Migrate an explicit legacy/app Teams root. Exported for deterministic tests;
 * production callers should use ensureUserTeamsMigrated().
 */
export function migrateUserTeams(options: UserTeamsMigrationOptions): UserTeamsMigrationResult {
  const { legacyRoot, teamsRoot } = options;
  const backupRoot = options.backupRoot
    ?? join(dirname(legacyRoot), `legacy-backup-${new Date().toISOString().slice(0, 10)}`, USER_PACKS_REL);
  const result: UserTeamsMigrationResult = { moved: [], conflicts: [] };
  if (!existsSync(legacyRoot)) return result;

  mkdirSync(teamsRoot, { recursive: true });
  for (const entry of readdirSync(legacyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(legacyRoot, entry.name);
    const pluginPath = join(source, "plugin.json");
    if (!existsSync(pluginPath)) continue;

    let manifest: Record<string, unknown>;
    try {
      const raw = JSON.parse(readFileSync(pluginPath, "utf-8"));
      if (!raw || typeof raw !== "object") continue;
      manifest = raw as Record<string, unknown>;
    } catch {
      log.warn("M2: unreadable user team manifest left in place", { source });
      continue;
    }
    const teamId = typeof manifest.id === "string" ? manifest.id.trim() : "";
    if (!teamId || manifest.publisher !== USER_TEAM_PUBLISHER) continue;

    const target = join(teamsRoot, teamId);
    if (existsSync(target)) {
      if (fileTreeSignature(source) === fileTreeSignature(target)) {
        rmSync(source, { recursive: true, force: true });
      } else {
        moveToBackup(source, backupRoot, teamId);
        result.conflicts.push(teamId);
        log.warn("M2: legacy user team conflicted with canonical Team and was backed up", {
          teamId,
          source,
          target,
        });
      }
      continue;
    }

    movePath(source, target);
    upgradeManifest(target, manifest);
    result.moved.push(teamId);
    log.info("M2: migrated user-packs Team", { teamId, from: source, to: target });
  }
  return result;
}

/** Run M2 against the real application data directories. */
export function ensureUserTeamsMigrated(): UserTeamsMigrationResult {
  return migrateUserTeams({
    legacyRoot: legacyUserTeamsDir(),
    teamsRoot: appTeamsDir(),
  });
}
