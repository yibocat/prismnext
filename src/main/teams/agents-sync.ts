/**
 * agents-sync.ts — build the opencode agent plan and write it to disk
 * (design §7.1). Driven entirely by the TeamResolver (teams/resolver.ts).
 *
 * File set: every ENABLED subagent (mode: subagent) + the lead agent of every
 * team that is enabled AND hasOrchestrator (mode: primary). Switching the
 * active team only rewrites the affected lead agents' permission.task block.
 *
 * Filenames come from AssetViewV2.runtimeName (resolver-computed); no local
 * shadowing logic here. Sync state is keyed per projectRoot (a Map), fixing
 * the single-slot PrismExpertsSyncState (B11).
 */

import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PromptContext } from "../prompts/types";
import type { OrchestratorDefV2, SubagentDefV2 } from "../../shared/teams/view";
import {
  getAsset,
  listAssets,
  readInstructions,
  resolveActiveTeam,
  resolveRoster,
} from "./resolver";
import {
  agentContentHash,
  appendRosterSection,
  renderOrchestratorMarkdown,
  renderSubagentMarkdown,
  type RosterRefMd,
} from "./agents-render";
import { createLogger } from "../services/logger";

const log = createLogger("teams-agents-sync");

export interface AgentFileEntry {
  filename: string;
  content: string;
}

export interface AgentsPlan {
  agentEntries: AgentFileEntry[];
  agentFiles: string[];
  /** Active team's lead agent runtimeName. */
  activeOrchestratorId: string;
  orchestratorContentHash: string;
  syncContentHash: string;
}

function computeSyncContentHash(entries: AgentFileEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.filename.localeCompare(b.filename));
  const payload = sorted.map((e) => `${e.filename}\0${e.content}`).join("\x1e");
  return agentContentHash(payload);
}

/** Resolve a lead agent's roster to render-ready refs (enabled members only). */
function rosterRefsFor(projectRoot: string, teamId: string): RosterRefMd[] {
  const view = resolveRoster(projectRoot, teamId);
  if (!view) return [];
  return view.entries
    .filter((e) => e.unavailable === undefined)
    .map((e) => {
      const asset = getAsset(projectRoot, e.fqid);
      return {
        id: asset?.runtimeName ?? e.fqid,
        name: e.name,
        description: asset?.description ?? "",
      };
    });
}

/** Build agent.md payloads without writing — used to skip redundant syncs. */
export function buildAgentsPlan(
  projectRoot: string,
  options?: { promptCtx?: PromptContext; defaultSubagentModel?: string | null },
): AgentsPlan {
  const promptCtx: PromptContext = { projectRoot, ...options?.promptCtx };
  let defaultSubagentModel = options?.defaultSubagentModel ?? null;
  if (options?.defaultSubagentModel === undefined) {
    try {
      const { getSettings } = require("../services/settings") as typeof import("../services/settings");
      defaultSubagentModel =
        (getSettings() as { aiSubagentModel?: string | null }).aiSubagentModel ?? null;
    } catch {
      defaultSubagentModel = null;
    }
  }

  const activeTeam = resolveActiveTeam(projectRoot);
  const activeOrchestratorFqid = `${activeTeam.manifest.id}:${activeTeam.orchestratorId}`;
  const activeOrchestrator = getAsset(projectRoot, activeOrchestratorFqid);
  if (!activeOrchestrator?.enabled) {
    throw new Error(`Active lead agent not found or disabled: ${activeOrchestratorFqid}`);
  }

  const agentEntries: AgentFileEntry[] = [];

  // All enabled subagents.
  for (const sub of listAssets(projectRoot, "subagent")) {
    if (!sub.enabled) continue;
    const instructions = readInstructions(projectRoot, sub.fqid);
    agentEntries.push({
      filename: `${sub.runtimeName}.md`,
      content: renderSubagentMarkdown(sub.definition as SubagentDefV2, instructions, promptCtx, {
        defaultModel: defaultSubagentModel,
      }),
    });
  }

  // The lead agent of every enabled team that has one (so the user can switch).
  const leadTeams = new Map<string, string>();
  for (const orch of listAssets(projectRoot, "orchestrator")) {
    if (!orch.enabled) continue;
    leadTeams.set(orch.teamId, orch.fqid);
  }
  let orchestratorMd = "";
  for (const [teamId, orchFqid] of leadTeams) {
    const orch = getAsset(projectRoot, orchFqid)!;
    const instructions = readInstructions(projectRoot, orchFqid);
    const roster = rosterRefsFor(projectRoot, teamId);
    const md = renderOrchestratorMarkdown(
      orch.definition as OrchestratorDefV2,
      instructions,
      roster,
      promptCtx,
    );
    if (orchFqid === activeOrchestratorFqid) orchestratorMd = md;
    agentEntries.push({ filename: `${orch.runtimeName}.md`, content: md });
  }

  return {
    agentEntries,
    agentFiles: agentEntries.map((e) => e.filename),
    activeOrchestratorId: activeOrchestrator.runtimeName,
    orchestratorContentHash: agentContentHash(orchestratorMd),
    syncContentHash: computeSyncContentHash(agentEntries),
  };
}

// ── Sync state (per projectRoot — fixes the single-slot B11) ──

export interface AgentsSyncState {
  projectRoot: string;
  syncedAt: number;
  agentFiles: string[];
  activeOrchestratorId: string;
  orchestratorContentHash: string;
  syncContentHash: string;
}

const syncStates = new Map<string, AgentsSyncState>();

export function getOpencodeAgentsDir(): string {
  return join(app.getPath("userData"), "opencode-server", "config", "opencode", "agents");
}

export function getAgentsSyncState(projectRoot: string): AgentsSyncState | null {
  return syncStates.get(projectRoot) ?? null;
}

/** Remove agent files that are no longer in the plan. */
function clearStaleAgentFiles(agentsDir: string, keep: Set<string>, previous: AgentsSyncState | null): void {
  const previousFiles = previous?.agentFiles ?? [];
  for (const file of previousFiles) {
    if (keep.has(file)) continue;
    const safe = file.replace(/[/\\]/g, "");
    if (!safe || safe !== file) continue;
    const target = join(agentsDir, safe);
    if (existsSync(target)) {
      try {
        unlinkSync(target);
      } catch {
        // non-fatal
      }
    }
  }
}

/** Write the agent plan to the opencode agents dir and record the sync state. */
export function syncAgentsToOpencode(
  projectRoot: string,
  options?: {
    agentsDir?: string;
    promptCtx?: PromptContext;
    defaultSubagentModel?: string | null;
  },
): AgentsSyncState {
  const agentsDir = options?.agentsDir ?? getOpencodeAgentsDir();
  mkdirSync(agentsDir, { recursive: true });

  const plan = buildAgentsPlan(projectRoot, options);
  const keep = new Set(plan.agentFiles);
  clearStaleAgentFiles(agentsDir, keep, syncStates.get(projectRoot) ?? null);
  for (const entry of plan.agentEntries) {
    writeFileSync(join(agentsDir, entry.filename), entry.content, "utf-8");
  }

  const state: AgentsSyncState = {
    projectRoot,
    syncedAt: Date.now(),
    agentFiles: plan.agentFiles,
    activeOrchestratorId: plan.activeOrchestratorId,
    orchestratorContentHash: plan.orchestratorContentHash,
    syncContentHash: plan.syncContentHash,
  };
  syncStates.set(projectRoot, state);
  return state;
}

/** Test-only: clear all sync states. */
export function __resetAgentsSyncForTests(): void {
  syncStates.clear();
}
