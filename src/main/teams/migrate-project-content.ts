/**
 * Project hangar maintenance (existing `.workbench/agent/teams/project.local`).
 *
 * Leftover paper-side `.prismnext/agent/local` and `agent/mcp.json` are not
 * read or copied (D-30). Does not mkdir an empty hangar — no hangar means no hangar.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  PROJECT_DEFAULT_TEAM_ID,
  PROJECT_LOCAL_LEAD_ID,
  PROJECT_TEAMS_REL,
} from "../../shared/teams/types";
import { createLogger } from "../app/logger";
import { projectTeamsDir } from "./scope";

const log = createLogger("teams-migrate-content", "agent");

export function projectDefaultTeamDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID);
}

/** Canonical on-disk name — UI always localizes via i18n. */
const PROJECT_LOCAL_MANIFEST_NAME = "Project Team";
const PROJECT_LOCAL_MANIFEST_DESC =
  "This project's always-on hangar — local content plus the Project lead.";
/** Legacy display names rewritten to the English canonical seed. */
const PROJECT_LOCAL_LEGACY_NAMES = new Set([
  "本项目团队",
  "本專案團隊",
  "This project",
  "Local Pack",
  "Local",
]);

/** @returns true when team.json was created or a legacy display name rewritten. */
function writeProjectLocalManifest(dest: string): boolean {
  const teamJson = join(dest, "team.json");
  const pluginJson = join(dest, "plugin.json");
  if (existsSync(teamJson)) {
    try {
      const raw = JSON.parse(readFileSync(teamJson, "utf-8")) as Record<string, unknown>;
      if (typeof raw.name === "string" && PROJECT_LOCAL_LEGACY_NAMES.has(raw.name)) {
        writeFileSync(
          teamJson,
          `${JSON.stringify(
            {
              ...raw,
              id: PROJECT_DEFAULT_TEAM_ID,
              name: PROJECT_LOCAL_MANIFEST_NAME,
              description: PROJECT_LOCAL_MANIFEST_DESC,
            },
            null,
            2,
          )}\n`,
          "utf-8",
        );
        return true;
      }
    } catch {
      // leave as-is
    }
    return false;
  }
  if (existsSync(pluginJson)) return false;
  const manifest = {
    id: PROJECT_DEFAULT_TEAM_ID,
    name: PROJECT_LOCAL_MANIFEST_NAME,
    description: PROJECT_LOCAL_MANIFEST_DESC,
    version: "0.0.0",
    packFormatVersion: 1,
    formatVersion: 2,
    tier: "free",
    publisher: "user",
  };
  writeFileSync(teamJson, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  return true;
}

/**
 * Ensure project.local has a hangar lead (parallel to My Content Chat).
 * Skips when any lead already exists under orchestrator/ or orchestrators/.
 */
function repairProjectLeadRoster(jsonPath: string): boolean {
  try {
    const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    const emptyExperts = Array.isArray(raw.allowedExperts) && raw.allowedExperts.length === 0;
    const roster = raw.roster;
    const emptyRoster =
      roster
      && typeof roster === "object"
      && !Array.isArray(roster)
      && (roster as { mode?: string; members?: unknown }).mode === "list"
      && Array.isArray((roster as { members?: unknown }).members)
      && (roster as { members: unknown[] }).members.length === 0;
    const needsSkills = !Array.isArray(raw.allowedSkills);
    const needsCommands = !Array.isArray(raw.allowedCommands);
    if (!emptyExperts && !emptyRoster && !needsSkills && !needsCommands) return false;
    const next: Record<string, unknown> = {
      ...raw,
      id: PROJECT_LOCAL_LEAD_ID,
      allowedSkills: Array.isArray(raw.allowedSkills) ? raw.allowedSkills : ["$pack"],
      allowedCommands: Array.isArray(raw.allowedCommands) ? raw.allowedCommands : ["$pack"],
    };
    if (emptyExperts || emptyRoster) {
      next.allowedExperts = ["$pack"];
      delete next.roster;
    }
    writeFileSync(jsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function ensureProjectLocalLead(dest: string): boolean {
  const singular = join(dest, "orchestrator", "orchestrator.json");
  if (existsSync(singular)) {
    return repairProjectLeadRoster(singular);
  }
  const plural = join(dest, "orchestrators");
  const projectLeadJson = join(plural, PROJECT_LOCAL_LEAD_ID, "orchestrator.json");
  if (existsSync(projectLeadJson)) {
    return repairProjectLeadRoster(projectLeadJson);
  }
  if (existsSync(plural)) {
    const entries = readdirSync(plural, { withFileTypes: true }).filter((e) => e.isDirectory());
    // A project.local custom lead may be the user's active default. Without an
    // explicit FQID/default rewrite map, do not seed and split it silently.
    if (entries.length > 0) return false;
  }
  const orchDir = join(plural, PROJECT_LOCAL_LEAD_ID);
  mkdirSync(orchDir, { recursive: true });
  writeFileSync(
    join(orchDir, "orchestrator.json"),
    `${JSON.stringify(
      {
        id: PROJECT_LOCAL_LEAD_ID,
        name: "Project",
        description: "Project hangar lead — always available for this project's local content.",
        // `$pack` → `@team`: own-team subagents / skills expand into Project allowlists.
        allowedExperts: ["$pack"],
        allowedSkills: ["$pack"],
        allowedCommands: ["$pack"],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  writeFileSync(
    join(orchDir, "instructions.md"),
    "You are the **project hangar lead** for this PrismNext project.\n\nOwn project-local conversation and tools when this team is active. Prefer on-disk project files over guessing.\n",
    "utf-8",
  );
  log.info("seeded project.local hangar lead", { dest });
  return true;
}

/** experts/ → subagents/; collapse orchestrators/ per M8. */
function normalizeProjectLocalLayout(projectRoot: string, dest: string): void {
  writeProjectLocalManifest(dest);

  const experts = join(dest, "experts");
  const subagents = join(dest, "subagents");
  if (existsSync(experts) && !existsSync(subagents)) {
    renameSync(experts, subagents);
  }

  // Keep the first lead under orchestrators/<id>/ (catalog dual-layout). Collapsing
  // into orchestrator/ would force id="orchestrator" and break runtime names.
  // Extra leads → sibling project teams project.local-<id>.
  const plural = join(dest, "orchestrators");
  if (!existsSync(plural)) return;

  const entries = readdirSync(plural, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // The built-in Project lead permanently owns project.local. Other leads
    // are user teams and must be split out, regardless of lexical order.
    .sort((a, b) => {
      if (a.name === PROJECT_LOCAL_LEAD_ID) return -1;
      if (b.name === PROJECT_LOCAL_LEAD_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  if (entries.length <= 1) return;

  for (const entry of entries.slice(1)) {
    const teamId = `${PROJECT_DEFAULT_TEAM_ID}-${entry.name}`;
    const sibling = join(projectTeamsDir(projectRoot), teamId);
    if (existsSync(sibling)) {
      log.warn("M8: sibling team already exists, skipping split", { teamId });
      continue;
    }
    mkdirSync(sibling, { recursive: true });
    // Preserve id via orchestrators/<id>/ in the sibling team.
    mkdirSync(join(sibling, "orchestrators"), { recursive: true });
    renameSync(join(plural, entry.name), join(sibling, "orchestrators", entry.name));
    writeFileSync(
      join(sibling, "team.json"),
      `${JSON.stringify(
        {
          id: teamId,
          name: entry.name,
          description: `Split from project.local (extra lead ${entry.name})`,
          version: "0.0.0",
          packFormatVersion: 1,
          formatVersion: 2,
          tier: "free",
          publisher: "user",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    log.warn("M8: split extra orchestrator into project team", { projectRoot, teamId });
  }
}

function projectLocalPresent(dest: string): boolean {
  return existsSync(dest);
}

/**
 * Hangar maintenance only. Leftover paper `.prismnext/agent/local` and
 * `agent/mcp.json` are not read or copied (D-30).
 */
export function ensureProjectContentMigrated(projectRoot: string): boolean {
  if (!projectRoot?.trim()) return false;

  const dest = projectDefaultTeamDir(projectRoot);
  if (!projectLocalPresent(dest)) return false;

  let changed = false;
  if (writeProjectLocalManifest(dest)) changed = true;
  if (ensureProjectLocalLead(dest)) {
    normalizeProjectLocalLayout(projectRoot, dest);
    changed = true;
  }
  return changed;
}

/** Writable project.local dir + manifest (explicit CRUD only — not on open). */
export function ensureProjectDefaultTeamDir(projectRoot: string): string {
  ensureProjectContentMigrated(projectRoot);
  const dest = projectDefaultTeamDir(projectRoot);
  mkdirSync(dest, { recursive: true });
  writeProjectLocalManifest(dest);
  ensureProjectLocalLead(dest);
  return dest;
}
