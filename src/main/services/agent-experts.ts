export interface ExpertDefinition {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  removable?: boolean;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  commands?: string[];
  rules?: string[];
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
  allowedExperts?: string[];
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  commands?: string[];
  rules?: string[];
  permission?: Record<string, unknown>;
}

export interface ExpertInfo extends ExpertDefinition {
  enabled: boolean;
  instructionsPreview: string;
  effectiveModules: string[];
}

export interface OrchestratorInfo extends OrchestratorDefinition {
  enabled: boolean;
  instructionsPreview: string;
  effectiveModules: string[];
}

export interface ExpertsManifest {
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, Partial<ExpertDefinition>>;
}

export interface OrchestratorsManifest {
  defaultOrchestratorId?: string;
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, Partial<OrchestratorDefinition>>;
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

export interface ExpertRuntimeFilters {
  modules?: string[];
  skills?: string[];
  mcpServers?: string[];
  commands?: string[];
}

export interface SaveCustomExpertPayload {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  permission?: Record<string, unknown>;
}

export interface SaveBuiltinExpertOverridePayload {
  expertId: string;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  permission?: Record<string, unknown>;
}

export interface SaveBuiltinOrchestratorOverridePayload {
  orchestratorId: string;
  allowedExperts?: string[];
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  permission?: Record<string, unknown>;
}

export interface SaveCustomOrchestratorPayload {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  allowedExperts?: string[];
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  permission?: Record<string, unknown>;
}

export const DEFAULT_ORCHESTRATOR_ID = "research-prism";
