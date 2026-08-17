/**
 * team-binding.ts — Resolves Team and Lead configuration for a Pi Agent session
 * by strictly consuming the authoritative TeamResolver (teams/resolver.ts).
 *
 * This module does NOT invent new catalogs, parallel experts, or disk file projections.
 */

import type { Fqid, BlockReason } from "../../shared/teams/types";
import type {
  AssetViewV2,
  OrchestratorDefV2,
  SubagentDefV2,
  TeamViewV2,
} from "../../shared/teams/view";
import {
  getAsset,
  listEffectiveSlashCommands,
  listMcpServers,
  listTeams,
  readInstructions,
  resolveChatOrchestrator,
  resolveRoster,
  resolveSkillsRoster,
} from "../teams/resolver";
import { ALL_NATIVE_TOOLS, type NativeToolDefinition } from "./tools/index";

export interface TeamPiBindingInput {
  projectRoot: string;
  sessionTeamId?: string | null;
  /** @deprecated Prefer sessionTeamId; still accepted for tab.orchestratorId */
  orchestratorId?: string | null;
  selectedExpertIds?: string[];
  extraSkillIds?: string[];
}

export interface ResolvedPiLeadConfig {
  teamId: string;
  fqid: Fqid;
  runtimeName: string;
  name: string;
  description: string;
  instructions: string;
  modelRef?: {
    provider: string;
    modelId: string;
  };
  thoughtLevel?: string;
  temperature?: number;
}

export interface ResolvedPiRosterEntry {
  fqid: Fqid;
  name: string;
  runtimeName: string;
  description: string;
  instructions: string;
  originTeamId: string;
  via: "team" | "explicit" | "all";
  available: boolean;
  unavailableReason?: BlockReason | "out-of-scope";
  modelRef?: {
    provider: string;
    modelId: string;
  };
  thoughtLevel?: string;
  temperature?: number;
  allowedTools: string[];
  isDelegatable: boolean;
  delegationBlockedReason?: string;
}

export interface TeamPiBindingResult {
  ok: boolean;
  error?: string;
  team?: TeamViewV2;
  lead?: ResolvedPiLeadConfig;
  roster?: ResolvedPiRosterEntry[];
  availableRoster?: ResolvedPiRosterEntry[];
  selectedRoster?: ResolvedPiRosterEntry[];
  skills?: AssetViewV2[];
  commands?: AssetViewV2[];
  mcps?: AssetViewV2[];
}

export interface DerivedExpertTools {
  allowedTools: string[];
  isSafe: boolean;
  reason?: string;
}

export const MODULE_TOOL_MAP: Record<string, string[]> = {
  "citation-audit": [
    "literature-search",
    "literature-read",
    "literature-read-pdf",
    "citation-health",
    "literature-export-bib",
    "latex-root",
  ],
  "literature-exploration": [
    "literature-search",
    "literature-discover",
    "literature-stage",
    "literature-add",
    "literature-delete",
    "literature-read",
    "literature-read-pdf",
    "literature-intensive-reading",
    "citation-health",
    "literature-export-bib",
  ],
  "latex-authoring": [
    "latex-root",
    "latex-compile",
    "literature-read",
    "literature-export-bib",
  ],
  "experiments": [
    "experiment-log",
    "experiment-run",
    "results-snapshot",
    "provenance-query",
    "interaction-list",
    "interaction-read",
    "interaction-write",
    "interaction-open",
  ],
  "research-design": [
    "literature-search",
    "literature-read",
    "research-brief-read",
    "research-brief-update",
    "interaction-list",
    "interaction-read",
    "interaction-write",
    "suggest-plan",
  ],
  "deep-research": [
    "literature-search",
    "literature-discover",
    "literature-read",
    "literature-read-pdf",
    "research-brief-read",
    "research-brief-update",
    "interaction-list",
    "interaction-read",
    "image-describe",
  ],
};

export function deriveExpertAllowedTools(
  def: SubagentDefV2,
  allTools: readonly NativeToolDefinition[] = ALL_NATIVE_TOOLS,
): DerivedExpertTools {
  const allToolNames = allTools.map((t) => t.name.toLowerCase()).filter((t) => t !== "task");
  const allToolsSet = new Set(allToolNames);

  // 1. Explicit tools list in permission
  if (def.permission && Array.isArray((def.permission as Record<string, unknown>).tools)) {
    const rawTools = (def.permission as { tools: unknown[] }).tools;
    const explicit = rawTools
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t !== "task" && allToolsSet.has(t));
    return {
      allowedTools: explicit,
      isSafe: true,
      ...(explicit.length === 0 ? { reason: "no_valid_tools_in_permission" } : {}),
    };
  }

  // 2. Permission rules object
  if (def.permission && typeof def.permission === "object") {
    const perm = def.permission as Record<string, unknown>;
    const wildcard = perm["*"];

    if (wildcard === "deny") {
      const allowed: string[] = [];
      for (const t of allToolNames) {
        const rule = perm[t];
        if (rule === "allow" || rule === "auto" || rule === "ask" || rule === true) {
          allowed.push(t);
        }
      }
      return {
        allowedTools: allowed,
        isSafe: true,
        ...(allowed.length === 0 ? { reason: "wildcard_deny_no_allowed_tools" } : {}),
      };
    }

    // Default allow with specific denies
    const denied = new Set<string>();
    for (const [k, v] of Object.entries(perm)) {
      if (v === "deny" || v === false) {
        denied.add(k.toLowerCase());
      }
    }
    const allowed = allToolNames.filter((t) => !denied.has(t));
    return {
      allowedTools: allowed,
      isSafe: true,
    };
  }

  // 3. Infer from modules if present
  if (def.modules && Array.isArray(def.modules) && def.modules.length > 0) {
    const moduleTools = new Set<string>();
    for (const mod of def.modules) {
      const mapped = MODULE_TOOL_MAP[mod];
      if (mapped) {
        for (const t of mapped) {
          if (allToolsSet.has(t)) moduleTools.add(t);
        }
      }
    }
    if (moduleTools.size > 0) {
      return {
        allowedTools: Array.from(moduleTools),
        isSafe: true,
      };
    }
  }

  // 4. Default safe fallback for general subagent: all non-destructive non-shell tools
  const defaultSafe = allTools
    .filter((t) => t.permission.category === "read_only" || t.permission.category === "safe_write")
    .map((t) => t.name.toLowerCase())
    .filter((t) => t !== "task");

  return {
    allowedTools: defaultSafe,
    isSafe: true,
  };
}

export function parseModelRef(
  rawModel?: string | null,
): { provider: string; modelId: string } | undefined {
  if (!rawModel) return undefined;
  const trimmed = rawModel.trim();
  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    return {
      provider: trimmed.slice(0, slash),
      modelId: trimmed.slice(slash + 1),
    };
  }
  return undefined;
}

export function resolveTeamPiBinding(input: TeamPiBindingInput): TeamPiBindingResult {
  const projectRoot = input.projectRoot?.trim();
  if (!projectRoot) {
    return { ok: false, error: "missing_project_root" };
  }

  let leadOrch: ReturnType<typeof resolveChatOrchestrator>;
  try {
    leadOrch = resolveChatOrchestrator(projectRoot, {
      sessionTeamId: input.sessionTeamId,
      orchestratorId: input.orchestratorId,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const allTeams = listTeams(projectRoot);

  if (input.sessionTeamId && leadOrch.teamId !== input.sessionTeamId) {
    const requested = allTeams.find((t) => t.manifest.id === input.sessionTeamId);
    return {
      ok: false,
      error: requested?.blockedBy
        ? `team_blocked:${requested.blockedBy}`
        : `team_disabled:${input.sessionTeamId}`,
    };
  }

  const team = allTeams.find((t) => t.manifest.id === leadOrch.teamId);
  if (!team || !team.enabled) {
    return {
      ok: false,
      error: team?.blockedBy
        ? `team_blocked:${team.blockedBy}`
        : `team_disabled:${leadOrch.teamId}`,
    };
  }

  const leadAsset = getAsset(projectRoot, leadOrch.fqid);
  const leadInstructions = readInstructions(projectRoot, leadOrch.fqid);
  const leadDef = (leadAsset?.definition ?? leadOrch.definition) as OrchestratorDefV2;

  const lead: ResolvedPiLeadConfig = {
    teamId: leadOrch.teamId,
    fqid: leadOrch.fqid,
    runtimeName: leadOrch.runtimeName,
    name: leadOrch.name,
    description: leadAsset?.description ?? leadDef.description ?? "",
    instructions: leadInstructions,
    modelRef: parseModelRef(leadDef.model),
    thoughtLevel: leadDef.thoughtLevel,
    temperature: leadDef.temperature,
  };

  // Resolve Roster
  const rosterView = resolveRoster(projectRoot, leadOrch.teamId);
  const roster: ResolvedPiRosterEntry[] = [];
  const availableRoster: ResolvedPiRosterEntry[] = [];

  if (rosterView) {
    for (const entry of rosterView.entries) {
      const asset = getAsset(projectRoot, entry.fqid);
      const instructions = readInstructions(projectRoot, entry.fqid);
      const subDef = (asset?.definition ?? {}) as SubagentDefV2;
      const isAvailable = entry.unavailable === undefined;
      const derived = deriveExpertAllowedTools(subDef);
      const isDelegatable = isAvailable && derived.allowedTools.length > 0;

      const item: ResolvedPiRosterEntry = {
        fqid: entry.fqid,
        name: entry.name,
        runtimeName: asset?.runtimeName ?? entry.fqid,
        description: asset?.description ?? subDef.description ?? "",
        instructions,
        originTeamId: entry.origin?.teamId ?? leadOrch.teamId,
        via: entry.via,
        available: isAvailable,
        unavailableReason: entry.unavailable,
        modelRef: parseModelRef(subDef.model),
        thoughtLevel: subDef.thoughtLevel,
        temperature: subDef.temperature,
        allowedTools: derived.allowedTools,
        isDelegatable,
        ...(isAvailable && derived.allowedTools.length === 0
          ? { delegationBlockedReason: derived.reason || "no_allowed_tools" }
          : {}),
      };

      roster.push(item);
      if (isAvailable && isDelegatable) {
        availableRoster.push(item);
      }
    }
  }

  // Handle selectedExpertIds filter for task delegation gating
  let selectedRoster: ResolvedPiRosterEntry[] = availableRoster;
  if (input.selectedExpertIds && input.selectedExpertIds.length > 0) {
    const selectedSet = new Set(
      input.selectedExpertIds.map((id) => id.trim().toLowerCase()),
    );
    selectedRoster = availableRoster.filter(
      (entry) =>
        selectedSet.has(entry.fqid.toLowerCase()) ||
        selectedSet.has(entry.runtimeName.toLowerCase()) ||
        selectedSet.has(entry.name.toLowerCase()),
    );
  }

  // Skills
  const skillsRoster = resolveSkillsRoster(projectRoot, leadOrch.teamId);
  const skills: AssetViewV2[] = [];
  const seenSkillFqids = new Set<string>();

  if (skillsRoster) {
    for (const entry of skillsRoster.entries) {
      if (entry.unavailable) continue;
      const asset = getAsset(projectRoot, entry.fqid);
      if (asset && asset.enabled) {
        skills.push(asset);
        seenSkillFqids.add(asset.fqid);
      }
    }
  }

  if (input.extraSkillIds && input.extraSkillIds.length > 0) {
    for (const extraId of input.extraSkillIds) {
      const asset = getAsset(projectRoot, extraId as Fqid);
      if (asset && asset.enabled && !seenSkillFqids.has(asset.fqid)) {
        skills.push(asset);
        seenSkillFqids.add(asset.fqid);
      }
    }
  }

  // Commands
  const commands = listEffectiveSlashCommands(projectRoot, leadOrch.teamId);

  // MCPs: only those belonging to the active team and enabled
  const allMcps = listMcpServers(projectRoot);
  const mcps = allMcps.filter((m) => m.teamId === leadOrch.teamId && m.enabled);

  return {
    ok: true,
    team,
    lead,
    roster,
    availableRoster,
    selectedRoster,
    skills,
    commands,
    mcps,
  };
}
