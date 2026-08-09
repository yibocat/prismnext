export interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  removable?: boolean;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  /**
   * Subset of shared profile prompt-module keys attached to this expert's
   * agent.md (trim what a Task call pays for — e.g. peer-reviewer needs no
   * experiments module). Absent → all shared expert modules. expertOnly
   * modules (subagent-role) are always attached.
   */
  modules?: string[];
  permission?: Record<string, unknown>;
}

export interface OrchestratorDefinition {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  /** Present and true on user-created orchestrators — marks them as deletable
   *  in the UI (built-in orchestrators cannot be removed, only disabled). */
  removable?: boolean;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  roster?: string[];
  permission?: Record<string, unknown>;
}

export interface SubagentInfo extends SubagentDefinition {
  /** Fully-qualified id (`teamId:contentId`); the facade always fills it, so render/IPC need not care. */
  fqid?: string;
  enabled: boolean;
  instructionsPreview: string;
  effectiveModules: string[];
}

export interface OrchestratorInfo extends OrchestratorDefinition {
  /** Fully-qualified id (`teamId:contentId`); the facade always fills it. */
  fqid?: string;
  enabled: boolean;
  instructionsPreview: string;
  effectiveModules: string[];
}

export interface PrismExpertsSyncState {
  projectRoot: string;
  syncedAt: number;
  agentFiles: string[];
  orchestratorId: string;
  /** Hash of primary orchestrator agent.md — reload OpenCode when this changes. */
  orchestratorContentHash?: string;
  /** Fingerprint of all synced agent.md bodies — skip rewrite when unchanged. */
  syncContentHash?: string;
}

export interface SaveCustomSubagentPayload {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  modules?: string[];
  permission?: Record<string, unknown>;
}

export interface SaveCustomOrchestratorPayload {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  roster?: string[];
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  permission?: Record<string, unknown>;
}

export const DEFAULT_ORCHESTRATOR_ID = "research-prism";
