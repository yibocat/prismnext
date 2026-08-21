/**
 * M8 / M11 — project content layout migration (design 2026-08-10 §11.2).
 *
 * M8: `.prismnext/agent/local/**` → `.prismnext/agent/teams/project.local/**`
 * M11: `.prismnext/agent/mcp.json` (object map) → `project.local/mcp.json` (array)
 *
 * Idempotent: safe to call on catalog build / project open.
 * Does not mkdir an empty project.local hangar — no hangar means no hangar.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  cpSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  LOCAL_TEAM_REL,
  PROJECT_DEFAULT_TEAM_ID,
  PROJECT_LOCAL_LEAD_ID,
  PROJECT_TEAMS_REL,
  type McpServerDef,
} from "../../shared/teams/types";
import { toFqid } from "../../shared/teams/state";
import { createLogger } from "../services/logger";
import { projectTeamsDir } from "./scope";
import { setProjectAssetEnabled } from "./state-project";

const log = createLogger("teams-migrate-content", "agent");

const LEGACY_AGENT_MCP_REL = ".prismnext/agent/mcp.json";
const RETIRED_MCP_IDS = new Set(["paper-search-mcp"]);

export function projectDefaultTeamDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID);
}

function legacyBackupRoot(projectRoot: string): string {
  return join(
    projectRoot,
    ".prismnext",
    "agent",
    `legacy-backup-${new Date().toISOString().slice(0, 10)}`,
  );
}

function moveIntoBackup(projectRoot: string, absPath: string, relUnderAgent: string): void {
  if (!existsSync(absPath)) return;
  const initialDest = join(legacyBackupRoot(projectRoot), relUnderAgent);
  let dest = initialDest;
  let suffix = 1;
  while (existsSync(dest)) {
    dest = `${initialDest}.${suffix++}`;
  }
  mkdirSync(dirname(dest), { recursive: true });
  try {
    renameSync(absPath, dest);
  } catch {
    cpSync(absPath, dest, { recursive: true });
    rmSync(absPath, { recursive: true, force: true });
  }
}

function movePath(source: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  try {
    renameSync(source, dest);
  } catch {
    cpSync(source, dest, { recursive: true });
    rmSync(source, { recursive: true, force: true });
  }
}

/**
 * Merge a partially migrated local/ tree into project.local.
 *
 * Destination files are authoritative v2 content. Legacy-only entries move
 * into the destination; conflicts are retained under legacy-backup instead of
 * silently replacing either side.
 */
function mergeLegacyLocalIntoProjectLocal(
  projectRoot: string,
  legacyDir: string,
  dest: string,
  rel = "",
): void {
  for (const entry of readdirSync(legacyDir, { withFileTypes: true })) {
    const source = join(legacyDir, entry.name);
    const relative = join(rel, entry.name);
    const target = join(dest, entry.name);

    if (!existsSync(target)) {
      movePath(source, target);
      continue;
    }

    if (entry.isDirectory() && statSync(target).isDirectory()) {
      mergeLegacyLocalIntoProjectLocal(projectRoot, source, target, relative);
      if (readdirSync(source).length === 0) rmSync(source, { recursive: true, force: true });
      continue;
    }

    moveIntoBackup(projectRoot, source, join("local-conflicts", relative));
    log.warn("M8: preserved conflicting legacy content in backup", {
      projectRoot,
      relative,
    });
  }
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

function convertLegacyMcpObject(raw: unknown): {
  servers: McpServerDef[];
  disabledIds: string[];
} {
  const servers: McpServerDef[] = [];
  const disabledIds: string[] = [];
  if (!raw || typeof raw !== "object") return { servers, disabledIds };
  const map = (raw as { mcpServers?: Record<string, Record<string, unknown>> }).mcpServers;
  if (!map || typeof map !== "object") return { servers, disabledIds };

  for (const [name, entry] of Object.entries(map)) {
    if (!name.trim() || !entry || typeof entry !== "object") continue;
    const id = name.trim();
    if (entry.enabled === false) disabledIds.push(id);

    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    const type = entry.type === "remote" || url ? "remote" : "local";
    if (type === "remote") {
      if (!url) continue;
      servers.push({
        id,
        name: id,
        description: typeof entry.description === "string" ? entry.description : undefined,
        autoStart: entry.autoStart === true,
        transport: {
          type: "http",
          url,
          headers:
            entry.headers && typeof entry.headers === "object"
              ? (entry.headers as Record<string, string>)
              : undefined,
        },
      });
      continue;
    }

    let command = "";
    let args: string[] | undefined;
    if (Array.isArray(entry.command)) {
      const parts = entry.command.filter((p): p is string => typeof p === "string" && p.length > 0);
      command = parts[0] ?? "";
      args = parts.slice(1);
    } else if (typeof entry.command === "string") {
      command = entry.command.trim();
      args = Array.isArray(entry.args)
        ? entry.args.filter((a): a is string => typeof a === "string")
        : undefined;
    }
    if (!command) continue;
    const env =
      (entry.env && typeof entry.env === "object"
        ? (entry.env as Record<string, string>)
        : undefined)
      ?? (entry.environment && typeof entry.environment === "object"
        ? (entry.environment as Record<string, string>)
        : undefined);
    servers.push({
      id,
      name: id,
      description: typeof entry.description === "string" ? entry.description : undefined,
      autoStart: entry.autoStart === true,
      transport: { type: "stdio", command, args, env },
    });
  }
  return {
    servers: servers.filter((server) => !RETIRED_MCP_IDS.has(server.id)),
    disabledIds: disabledIds.filter((id) => !RETIRED_MCP_IDS.has(id)),
  };
}

function migrateProjectMcp(projectRoot: string, dest: string): boolean {
  const legacyPath = join(projectRoot, LEGACY_AGENT_MCP_REL);
  const newPath = join(dest, "mcp.json");
  if (!existsSync(legacyPath)) return false;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(legacyPath, "utf-8"));
  } catch (err) {
    log.warn("M11: legacy mcp.json unreadable, backing up as-is", {
      projectRoot,
      error: String(err),
    });
    moveIntoBackup(projectRoot, legacyPath, "mcp.json");
    return true;
  }

  const { servers, disabledIds } = convertLegacyMcpObject(raw);
  let merged = servers;
  let addedServers = servers;
  if (existsSync(newPath)) {
    try {
      const existingRaw = JSON.parse(readFileSync(newPath, "utf-8"));
      if (!Array.isArray(existingRaw)) throw new Error("project.local mcp.json is not an array");
      const existing = (existingRaw as McpServerDef[]).filter(
        (server) => server && typeof server === "object" && !RETIRED_MCP_IDS.has(server.id),
      );
      const existingIds = new Set(
        existing
          .map((server) => server && typeof server === "object" ? (server as McpServerDef).id : "")
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      addedServers = servers.filter((server) => !existingIds.has(server.id));
      merged = [...existing, ...addedServers];
    } catch (err) {
      // Retain the legacy file intact so a later repair can merge it safely.
      log.warn("M11: project.local/mcp.json unreadable; leaving legacy MCP in place", {
        projectRoot,
        error: String(err),
      });
      return false;
    }
  }

  mkdirSync(dest, { recursive: true });
  writeProjectLocalManifest(dest);
  writeFileSync(newPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  const addedIds = new Set(addedServers.map((server) => server.id));
  for (const id of disabledIds) {
    // An explicitly configured project.local server wins over a legacy
    // duplicate, including its enabled state.
    if (existsSync(newPath) && !addedIds.has(id) && merged !== servers) continue;
    try {
      setProjectAssetEnabled(projectRoot, toFqid(PROJECT_DEFAULT_TEAM_ID, id), false);
    } catch (err) {
      log.warn("M11: failed to record disabled MCP", { id, error: String(err) });
    }
  }
  moveIntoBackup(projectRoot, legacyPath, "mcp.json");
  log.info("M11: merged agent/mcp.json → project.local/mcp.json", {
    projectRoot,
    count: addedServers.length,
    disabled: disabledIds.length,
  });
  return true;
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
