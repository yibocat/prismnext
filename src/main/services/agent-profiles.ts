export interface AgentProfileDefinition {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  removable?: boolean;
  /** Installed skill ids enabled for this profile (empty/omit = all installed) */
  skills?: string[];
  /** MCP server names from project mcp.json (empty/omit = all) */
  mcpServers?: string[];
  /** Knowledge module keys in profile scope (must also be globally enabled at runtime) */
  modules?: string[];
  /** Slash command names (empty/omit = all enabled commands) */
  commands?: string[];
  /** Custom rule names from project settings (empty/omit = all enabled rules) */
  rules?: string[];
  model?: string;
  thoughtLevel?: string;
}

export interface AgentProfileInfo extends AgentProfileDefinition {
  enabled: boolean;
  instructionsPreview: string;
  /** Module keys that inject when this profile is active (profile ∩ global). */
  effectiveModules: string[];
}

export interface BuiltinProfileOverride {
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  rules?: string[];
  model?: string;
  thoughtLevel?: string;
}

export interface ProfilesManifest {
  /** @deprecated legacy — no longer used; profiles are selected via @ mention only */
  defaultMainProfileId?: string;
  /** @deprecated legacy — no longer used */
  defaultProfileId?: string;
  /** Built-in preset ids turned off for this project (still visible in settings). */
  disabledBuiltinIds?: string[];
  /** Per-project capability overrides for built-in profiles. */
  builtinOverrides?: Record<string, BuiltinProfileOverride>;
}

export interface ProfileRuntimeFilters {
  modules?: string[];
  skills?: string[];
  mcpServers?: string[];
  commands?: string[];
  rules?: string[];
}

export interface SaveBuiltinProfileOverridePayload {
  profileId: string;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  rules?: string[];
  model?: string;
  thoughtLevel?: string;
}

export interface SaveCustomProfilePayload {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  /** `providerId/modelId` — omit to use chat default */
  model?: string;
  thoughtLevel?: string;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  rules?: string[];
}

export interface ProfileEditorOptions {
  skills: Array<{ id: string; name: string; description: string; enabled: boolean }>;
  mcpServers: Array<{ name: string }>;
  modules: Array<{ key: string; label: string; description: string; globallyEnabled: boolean }>;
  commands: Array<{ name: string; description: string; enabled: boolean }>;
  rules: Array<{ name: string }>;
}

export const DEFAULT_PROFILE_ID = "academic-writer";

/** @deprecated use DEFAULT_PROFILE_ID */
export const DEFAULT_MAIN_PROFILE_ID = DEFAULT_PROFILE_ID;
