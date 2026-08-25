/**
 * my-content.ts — ensure the always-on My Content team + its chat lead exist.
 *
 * My Content is the app-level safety net: hangar for unassigned user content
 * and the last-resort lead agent for conversation when PrismNext Core (or any
 * other lead team) is disabled/uninstalled. The team and its lead must not be
 * deleted or disabled by lifecycle mutations (enforced in lifecycle.ts).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MY_CONTENT_LEAD_ID,
  MY_CONTENT_TEAM_ID,
  USER_TEAM_PUBLISHER,
} from "../../shared/teams/types";
import { createLogger } from "../app/logger";
import { invalidateCatalog } from "./catalog";
import { appTeamsDir } from "./scope";

const log = createLogger("teams-my-content", "agent");

const TEAM_MANIFEST = {
  id: MY_CONTENT_TEAM_ID,
  name: "Common Team",
  description:
    "Your common hangar — content you created without assigning it to a specific team, plus the always-on chat lead agent. Available in every project.",
  version: "1.0.0",
  packFormatVersion: 1,
  tier: "free" as const,
  publisher: USER_TEAM_PUBLISHER,
  formatVersion: 2,
};

/**
 * `$pack` → `@team` in catalog: own-team subagents expand into Chat's Task roster.
 * Does NOT inherit Core (or any other team) experts.
 */
const LEAD_JSON = {
  id: MY_CONTENT_LEAD_ID,
  name: "Chat",
  description: "Default conversation lead — always available when other teams are off.",
  thoughtLevel: "medium",
  allowedExperts: ["$pack"] as string[],
  allowedSkills: ["$pack"] as string[],
  allowedCommands: ["$pack"] as string[],
};

const LEAD_INSTRUCTIONS = `You are the **default chat lead** for PrismNext — a general research assistant for this project.

You own the main conversation: answer questions, use tools, edit files when asked, and keep the user oriented.

Prefer evidence from tools and on-disk files over guessing. Be concise and practical. Ask before large irreversible changes.
`;

function teamDir(): string {
  return join(appTeamsDir(), MY_CONTENT_TEAM_ID);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function ensureManifest(dir: string): boolean {
  const path = join(dir, "team.json");
  const legacyPlugin = join(dir, "plugin.json");
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      // Rename display legacy names → "Common Team" without touching other user edits.
      if (raw.name === "My Content" || raw.name === "Common") {
        writeJson(path, { ...raw, name: TEAM_MANIFEST.name, description: TEAM_MANIFEST.description });
        return true;
      }
    } catch {
      // leave as-is
    }
    return false;
  }
  // Prefer upgrading legacy plugin.json in place rather than inventing a second identity.
  if (existsSync(legacyPlugin)) {
    try {
      const raw = JSON.parse(readFileSync(legacyPlugin, "utf-8")) as Record<string, unknown>;
      const upgraded: Record<string, unknown> = {
        ...TEAM_MANIFEST,
        ...raw,
        id: MY_CONTENT_TEAM_ID,
        name: TEAM_MANIFEST.name,
        publisher: USER_TEAM_PUBLISHER,
        formatVersion: 2,
      };
      delete upgraded.contents;
      writeJson(path, upgraded);
      return true;
    } catch {
      // fall through to write defaults
    }
  }
  writeJson(path, TEAM_MANIFEST);
  return true;
}

/** True when Chat roster is mode "all" (would pull every team's subagents). */
function isOpenAllRoster(raw: Record<string, unknown>): boolean {
  const roster = raw.roster;
  if (roster && typeof roster === "object" && !Array.isArray(roster)) {
    return (roster as { mode?: string }).mode === "all";
  }
  // Missing allowlist → catalog defaults to mode "all".
  if (raw.allowedExperts === undefined && roster === undefined) return true;
  return false;
}

/** Empty list seed — own-team subagents never reached Chat's Task roster. */
function isEmptyListRoster(raw: Record<string, unknown>): boolean {
  if (Array.isArray(raw.allowedExperts) && raw.allowedExperts.length === 0) return true;
  const roster = raw.roster;
  if (roster && typeof roster === "object" && !Array.isArray(roster)) {
    const o = roster as { mode?: string; members?: unknown };
    return o.mode === "list" && Array.isArray(o.members) && o.members.length === 0;
  }
  return false;
}

function repairChatRoster(jsonPath: string): boolean {
  try {
    const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    const needsExperts = isOpenAllRoster(raw) || isEmptyListRoster(raw);
    const needsSkills = !Array.isArray(raw.allowedSkills);
    const needsCommands = !Array.isArray(raw.allowedCommands);
    if (!needsExperts && !needsSkills && !needsCommands) return false;
    const next: Record<string, unknown> = {
      ...raw,
      ...(needsExperts ? LEAD_JSON : {}),
      id: MY_CONTENT_LEAD_ID,
      allowedSkills: Array.isArray(raw.allowedSkills) ? raw.allowedSkills : ["$pack"],
      allowedCommands: Array.isArray(raw.allowedCommands) ? raw.allowedCommands : ["$pack"],
    };
    if (needsExperts) {
      next.allowedExperts = LEAD_JSON.allowedExperts;
      delete next.roster;
    }
    writeJson(jsonPath, next);
    return true;
  } catch {
    return false;
  }
}

function ensureLead(dir: string): boolean {
  // Prefer plural `orchestrators/<id>/` so the lead id is `chat` (singular
  // `orchestrator/` forces id "orchestrator" in the catalog scanner today).
  const singularJson = join(dir, "orchestrator", "orchestrator.json");
  const chatJson = join(dir, "orchestrators", MY_CONTENT_LEAD_ID, "orchestrator.json");
  const legacyRoot = join(dir, "orchestrators");

  if (existsSync(chatJson)) {
    return repairChatRoster(chatJson);
  }
  if (existsSync(singularJson)) {
    return repairChatRoster(singularJson);
  }
  if (existsSync(legacyRoot)) {
    // Some other lead dir exists — leave it; do not invent a second lead.
    return false;
  }

  const orchDir = join(legacyRoot, MY_CONTENT_LEAD_ID);
  mkdirSync(orchDir, { recursive: true });
  writeJson(join(orchDir, "orchestrator.json"), LEAD_JSON);
  writeFileSync(join(orchDir, "instructions.md"), LEAD_INSTRUCTIONS, "utf-8");
  return true;
}

/**
 * Idempotent: create/repair My Content + chat lead under `<userData>/teams/`.
 * Call after user-team migration and before the first catalog scan consumers run.
 */
export function ensureMyContentTeam(): { dir: string; createdOrRepaired: boolean } {
  const dir = teamDir();
  mkdirSync(dir, { recursive: true });
  const manifestWrote = ensureManifest(dir);
  const leadWrote = ensureLead(dir);
  const createdOrRepaired = manifestWrote || leadWrote;
  if (createdOrRepaired) {
    invalidateCatalog();
    log.info("My Content team ensured", { dir, manifestWrote, leadWrote });
  }
  return { dir, createdOrRepaired };
}

export function isMyContentTeamId(teamId: string): boolean {
  return teamId === MY_CONTENT_TEAM_ID;
}

export function isMyContentLeadFqid(fqid: string): boolean {
  return fqid === `${MY_CONTENT_TEAM_ID}:${MY_CONTENT_LEAD_ID}`;
}
