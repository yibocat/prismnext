// src/main/agents/types.ts
import type { CliParser } from "../cli/types";
import type { ContextCalculator } from "./context-calculator";

// ─── Agent Context Assembly ───

/** Categories of project-level context that an agent can request. */
export type ContextComponent = "skills" | "mcp" | "rules" | "plugins" | "venv" | "path";

/** Project-level context resolved by CliManager before spawning the agent.
 *  Only components listed in the agent's `contextComponents` array are populated;
 *  others are left undefined. */
export interface ResolvedContext {
  /** Layer 1: Prism application-level system prompt (always populated). */
  appSystemPrompt: string;
  /** Content of the nearest CLAUDE.md / project rules file. */
  rules?: string;
  /** Absolute path to the agent's skills directory. */
  skillsDir?: string;
  /** Absolute path to mcp.json. */
  mcpConfig?: string;
  /** Absolute path to the agent's plugins directory. */
  pluginsDir?: string;
  /** Absolute path to the project's .venv directory. */
  venvPath?: string;
  /** Augmented PATH string (nvm + pnpm + venv + cargo + brew). */
  augmentedPath?: string;
}

/** Result of agent-specific context assembly. */
export interface AssembledContext {
  /** System prompt to inject into the agent process. */
  systemPrompt?: string;
  /** Additional CLI arguments appended after base agent.args. */
  extraArgs: string[];
  /** Additional environment variables merged on top of agent.env. */
  extraEnv: Record<string, string>;
}

export interface AgentSettingOption {
  id: string | null;  // null = default
  name: string;
  desc?: string;
}

export type AgentSettingType = "model" | "select" | "effort";

export interface AgentSetting {
  key: string;
  type: AgentSettingType;
  label: string;
  options?: AgentSettingOption[];
  levels?: string[];
}

export interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  /** Agent that owns this session */
  agentId: string;
  /** Display name of the agent */
  agentName: string;
}

export interface SessionProvider {
  /** Set the project root directory. Called once before any other method. */
  setProjectRoot(path: string): void;
  /** List all sessions for this agent in the project. */
  listSessions(): Promise<SessionInfo[]>;
  /** Load full session history. */
  loadSession(sessionId: string): Promise<any[]>;
  /** Delete a session permanently. */
  deleteSession(sessionId: string): Promise<void>;
}

export interface AgentIntegration {
  id: string;
  name: string;
  description: string;
  binary: string;
  args: string[];
  env?: Record<string, string>;
  placeholder: boolean;
  /**
   * Subdirectory under .prismnext/agent-config/ for this agent's config.
   * When set AND supportsProjectConfig is true, CliManager passes
   * --mcp-config and --add-dir pointing to this directory when spawning
   * the agent process.
   * Example: "claude" → .prismnext/agent-config/claude/
   */
  configSubdir?: string;
  /** Whether this agent's CLI supports project-level config injection
   *  (--mcp-config / --add-dir flags). When true AND configSubdir is set,
   *  CliManager injects the project-local agent config directory.
   *  Defaults to false. */
  supportsProjectConfig?: boolean;
  /**
   * Environment variable names for the API gateway (third-party proxy).
   * When set, CliManager uses these names instead of the hardcoded
   * ANTHROPIC_* defaults.
   * Example: { baseUrl: "OPENAI_BASE_URL", apiKey: "OPENAI_API_KEY" }
   */
  gatewayEnvMapping?: { baseUrl: string; apiKey: string };
  settings: AgentSetting[];
  createParser(): CliParser;
  createSessionProvider(): SessionProvider;
  /** Create the context token calculator for this agent. */
  createCalculator(): ContextCalculator;
  /**
   * Map user-configured settings (from the renderer agent-settings UI) into
   * CLI arguments and environment variables for this specific agent.
   *
   * Each agent implements its own mapping — Claude maps "effort" →
   * CLAUDE_CODE_EFFORT_LEVEL, "agentMode" → --permission-mode; Gemini would
   * map "temperature" → a Gemini-specific flag, etc. The shared
   * infrastructure (CliManager, IPC) never knows about agent-specific keys.
   *
   * Called by CliManager.ensureProcess() before spawning. The returned args
   * are appended to the base agent.args; the returned env entries are merged
   * on top of the base agent.env (overriding any defaults).
   */
  applySettings?(settings: Readonly<Record<string, string | null>>): {
    args: string[];
    env: Record<string, string>;
  };
  /**
   * Which project-level context components this agent needs before spawn.
   * When non-empty, CliManager calls resolveContext(cwd, components) then
   * passes the result to assembleContext(). Stub agents leave this unset.
   */
  contextComponents?: ContextComponent[];
  /**
   * Translate resolved project context into CLI arguments and environment
   * variables for this specific agent. Each agent decides how to map
   * context to its CLI's particular flags and conventions.
   *
   * Called by CliManager.ensureProcess() right before spawn.
   */
  assembleContext?(ctx: ResolvedContext): AssembledContext;
}
