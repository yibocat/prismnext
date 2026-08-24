/**
 * user-packs.ts — User-created teams, stored app-level like installed teams.
 *
 * A user team is just an app-level pack living at
 * `~/.prismnext/teams/<teamId>/` (plugin.json + orchestrators/ + experts/...).
 * Catalog scans that home folder as the writable user root — same content
 * model as installed packs, with enable/disable shared across projects.
 *
 * Because teamDirFingerprint aggregates every content file, any change inside
 * a user team (new orchestrator, edited expert, …) bumps the catalog
 * fingerprint and invalidates every project view automatically.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { USER_TEAM_PUBLISHER } from "../../shared/teams/types";
import { appTeamsDir, setAppTeamsDirForTests } from "./scope";
import { invalidateCatalog as invalidateCatalogV2 } from "./catalog";
import { createLogger } from "../app/logger";

const log = createLogger("user-teams");

export const USER_PACKS_REL = "user-packs";

/** Test-injectable root (sealed fixture per test), like packs-installed. */
export function setUserTeamsDataDir(dir: string | null): void {
  setAppTeamsDirForTests(dir);
}

function rootDir(): string {
  return appTeamsDir();
}

/** Absolute path of the user teams root (for fingerprinting). */
export function userTeamsRootDir(): string {
  return rootDir();
}

/** Ensure the home teams folder exists and the catalog will rescan it. */
export function ensureUserTeamsRegistered(): void {
  mkdirSync(rootDir(), { recursive: true });
  invalidateCatalogV2();
}

export interface UserTeam {
  teamId: string;
  name: string;
  description: string;
  version: string;
  dir: string;
}

/** All user-created teams (directories with a user-published plugin.json). */
export function listUserTeams(): UserTeam[] {
  const dir = rootDir();
  if (!existsSync(dir)) return [];
  const out: UserTeam[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const teamDir = join(dir, entry.name);
    const manifestPath = join(teamDir, "plugin.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
        id?: string;
        name?: string;
        description?: string;
        version?: string;
        publisher?: string;
      };
      if (m?.publisher === USER_TEAM_PUBLISHER && typeof m.id === "string" && m.id) {
        out.push({
          teamId: m.id,
          name: m.name ?? entry.name,
          description: m.description ?? "",
          version: m.version ?? "0.1.0",
          dir: teamDir,
        });
      }
    } catch {
      // malformed team dir → skip
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "team";
}

function uniqueTeamId(base: string): string {
  const existing = new Set(listUserTeams().map((t) => t.teamId));
  for (let i = 0; i < 100; i++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const id = `user.${base}-${suffix}`;
    if (!existing.has(id)) return id;
  }
  return `user.${base}-${Date.now().toString(36)}`;
}

/** Create a user team (app-level). Invalidates the catalog so it appears as a pack. */
export function createUserTeam(name: string, description = ""): UserTeam {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Team name is required");
  const id = uniqueTeamId(slugify(trimmedName));
  const dir = join(rootDir(), id);
  mkdirSync(join(dir, "orchestrators"), { recursive: true });
  mkdirSync(join(dir, "experts"), { recursive: true });
  writeFileSync(
    join(dir, "plugin.json"),
    `${JSON.stringify(
      {
        id,
        name: trimmedName,
        description: description.trim(),
        version: "0.1.0",
        packFormatVersion: 1,
        tier: "free",
        publisher: USER_TEAM_PUBLISHER,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  invalidateCatalogV2();
  log.info("user team created", { id });
  return { teamId: id, name: trimmedName, description: description.trim(), version: "0.1.0", dir };
}

/** Delete a user team (app-level). Invalidates the catalog. */
export function deleteUserTeam(teamId: string): void {
  const team = listUserTeams().find((t) => t.teamId === teamId);
  if (!team) throw new Error(`User team not found: ${teamId}`);
  rmSync(team.dir, { recursive: true, force: true });
  invalidateCatalogV2();
  log.info("user team deleted", { teamId });
}
