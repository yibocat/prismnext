/**
 * view.ts — resolved view types for Team architecture v2 (design 2026-08-10 §5.2).
 *
 * These are the OUTPUT of the TeamResolver (src/main/teams/resolver.ts): what
 * teams exist, whether they are usable, and why not. Kept separate from
 * types.ts because the v1 TeamView/AssetView there are still consumed by the
 * legacy path; this file is the v2 target shape and is collision-free.
 */

import type {
  AssetKind,
  AssetOverride,
  BlockReason,
  Fqid,
  RosterSpec,
  TeamManifest,
  TeamScope,
  TeamSource,
  TeamTier,
} from "./types";

// ── v2 asset definitions (roster is a RosterSpec, not a string[]) ──

export interface OrchestratorDefV2 {
  id: string;
  name: string;
  description: string;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  /** Lead agent roster. Default = { mode: "all" }. */
  roster?: RosterSpec;
  permission?: Record<string, unknown>;
}

export interface SubagentDefV2 {
  id: string;
  name: string;
  description: string;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  modules?: string[];
  permission?: Record<string, unknown>;
}

// ── Team view ─────────────────────────────────────────────

export interface TeamViewV2 {
  manifest: TeamManifest;
  scope: TeamScope;
  source: TeamSource;
  /** Absolute team directory. */
  dir: string;
  /** user / project teams are writable; core/bundled/pro/registry are read-only. */
  writable: boolean;
  /** Whether the team carries a lead agent (orchestrator/). */
  hasOrchestrator: boolean;
  /** The lead agent's assetId when hasOrchestrator. */
  orchestratorId?: string;

  // ── Resolved state (final verdict + raw tri-state values for the UI) ──
  installed: boolean;
  licenseOk: boolean;
  compatible: boolean;
  enabled: boolean;
  blockedBy?: BlockReason;
  /** Raw app tri-state value (undefined = unset). */
  enabledApp?: boolean;
  /** Raw project tri-state value (undefined = unset). */
  enabledProject?: boolean;

  counts: Record<AssetKind, number>;
}

// ── Asset view ────────────────────────────────────────────

export interface AssetOriginV2 {
  teamId: string;
  teamName: string;
  scope: TeamScope;
  source: TeamSource;
  tier: TeamTier;
}

export interface AssetViewV2<TDef = unknown> {
  fqid: Fqid;
  kind: AssetKind;
  teamId: string;
  /** Asset id within the team. */
  id: string;
  name: string;
  description: string;
  /** Definition with overrides applied (project wins over app). */
  definition: TDef;
  /** Asset dir absolute path (command = the .md file path). */
  dir: string;
  origin: AssetOriginV2;

  enabled: boolean;
  blockedBy?: BlockReason;
  enabledApp?: boolean;
  enabledProject?: boolean;

  /** writable team → editable/deletable. */
  editable: boolean;
  /** An assetOverrides record exists at either layer. */
  hasOverride: boolean;
  /**
   * Runtime exposure name (agent file base / skill dir name / command name /
   * MCP server name). May differ from id after shadowing (§7.1).
   */
  runtimeName: string;
}

// ── Roster view ───────────────────────────────────────────

export interface RosterEntryView {
  fqid: Fqid;
  name: string;
  origin: AssetOriginV2;
  /** How the entry got in: "@team" dynamic, explicit list, or "all" default. */
  via: "team" | "explicit" | "all";
  /** Set when the reference is valid but currently unusable. */
  unavailable?: BlockReason | "out-of-scope";
}

export interface RosterView {
  teamId: string;
  orchestratorFqid: Fqid;
  spec: RosterSpec;
  entries: RosterEntryView[];
}

// ── Override application helper type ──────────────────────

export type { AssetOverride };
