// ─── Agent Config Types ───

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

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  /** Executable name (resolved from PATH) or "npx" for npm packages. */
  binary: string;
  /** CLI arguments. Passed directly to spawn(). */
  args: string[];
  /** Environment variables added to the child process. */
  env?: Record<string, string>;
  /** If true, the agent is not yet implemented and won't appear in the UI. */
  placeholder: boolean;
  /** Settings exposed in the agent settings bar next to the composer. */
  settings: AgentSetting[];
}

/*
 * =========================================================================
 * How to add a new Agent
 * =========================================================================
 *
 * Each agent is spawned as a long-lived child process (see CliManager).
 * Communication happens over stdin/stdout using NDJSON (newline-delimited
 * JSON). The renderer speaks a single message format (ChatStreamMessage);
 * each agent needs a Parser that translates its native output into that
 * format.
 *
 * Files you need to touch:
 *
 *   1. THIS FILE (configs.ts)
 *      - Add an entry to the AGENTS registry with binary, args, env, and
 *        settings. Set placeholder: false once implemented.
 *
 *   2. NEW PARSER (src/main/cli/<agent>-parser.ts)
 *      - Implement the CliParser interface:
 *           parse(line: string): Record<string, unknown> | null
 *           reset(): void
 *      - parse() receives one NDJSON line from the agent's stdout and
 *        returns either null (skip) or a ChatStreamMessage-shaped object:
 *           { type: "assistant" | "user" | "result", message?: { content },
 *             session_id?, usage?, duration_ms?, result?, is_error? }
 *      - For streaming, emit progressive "assistant" messages whose
 *        content blocks accumulate text/thinking as deltas arrive.
 *      - reset() is called between prompts / on cancel.
 *
 *   3. cli-manager.ts
 *      - Register the parser in the PARSERS map (keyed by agent id).
 *      - If the agent needs special spawn handling (env vars, extra args
 *        like --model), add it to sendPrompt() / ensureProcess().
 *
 *   4. agent-config.ts (renderer)
 *      - Mirror the settings definition so the UI can render them.
 *
 *   5. <agent>-settings.tsx (renderer)
 *      - Build the settings UI component (model picker, etc.).
 *      - Register it in agent-settings-bar.tsx.
 *
 *   6. electron.d.ts + preload/index.ts
 *      - If the agent needs unique IPC channels (unlikely — the existing
 *        cli:* channels are agent-agnostic), add them here.
 *
 * Requirements for an agent CLI to be compatible:
 *   - Must accept prompts via stdin (NDJSON or plain text) or CLI argument.
 *   - Must output responses to stdout, one JSON object per line (NDJSON).
 *   - Must support streaming (incremental output before the full response
 *     is complete). If the CLI doesn't support streaming natively, you can
 *     still integrate it but the UX will be degraded (full response appears
 *     at once instead of token-by-token).
 *   - Should provide session management (create/resume) for multi-turn
 *     conversations.
 * =========================================================================
 */

// ─── Agent Registry ───

export const AGENTS: Record<string, AgentConfig> = {
  /*
   * Claude Code — fully implemented.
   * Uses `claude` CLI in headless mode with stream-json NDJSON protocol.
   * --include-partial-messages enables per-token streaming deltas wrapped
   * in stream_event envelopes. The ClaudeParser unwraps them and emits
   * progressive assistant messages.
   */
  claude: {
    id: "claude",
    name: "Claude Code",
    description: "Anthropic Claude Code CLI",
    binary: "claude",
    args: [
      "--verbose",
      "--output-format", "stream-json",
      "--input-format", "stream-json",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
    ],
    placeholder: false,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default", desc: "Use system Claude Code setting" },
          { id: "sonnet", name: "Sonnet", desc: "Fast, efficient for most tasks" },
          { id: "opus", name: "Opus", desc: "Most capable, complex reasoning" },
          { id: "haiku", name: "Haiku", desc: "Fastest, simple tasks" },
        ],
      },
      {
        key: "agentMode",
        type: "select",
        label: "Mode",
        options: [
          { id: "edit-before-ask", name: "Edit before ask" },
          { id: "auto-edit", name: "Auto edit" },
          { id: "plan", name: "Plan mode" },
        ],
      },
      {
        key: "effort",
        type: "effort",
        label: "Effort",
        levels: ["low", "medium", "high"],
      },
    ],
  },

  /*
   * OpenCode — not yet implemented.
   * TODO:
   *   - Confirm the headless CLI args (likely: opencode --output-format json)
   *   - Write OpenCodeParser implementing CliParser
   *   - Register in cli-manager.ts PARSERS map
   *   - Add renderer-side config in agent-config.ts + settings component
   */
  opencode: {
    id: "opencode",
    name: "OpenCode",
    description: "OpenCode CLI",
    binary: "npx",
    args: ["opencode"],
    placeholder: true,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default" },
          { id: "gpt-4o", name: "GPT-4o", desc: "Latest GPT-4 Omni" },
          { id: "gpt-4-turbo", name: "GPT-4 Turbo", desc: "Fast GPT-4" },
        ],
      },
      {
        key: "reasoning",
        type: "select",
        label: "Reasoning",
        options: [
          { id: "low", name: "Low" },
          { id: "medium", name: "Medium" },
          { id: "high", name: "High" },
        ],
      },
    ],
  },

  /*
   * Gemini CLI — not yet implemented.
   * TODO:
   *   - Gemini CLI supports --output-format json and stdin input.
   *   - Write GeminiParser implementing CliParser.
   *   - Register in cli-manager.ts PARSERS map.
   *   - Add renderer-side config + settings component.
   */
  gemini: {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google Gemini CLI",
    binary: "gemini",
    args: [],
    placeholder: true,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Most capable" },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Fast & efficient" },
        ],
      },
      {
        key: "temperature",
        type: "select",
        label: "Style",
        options: [
          { id: "precise", name: "Precise" },
          { id: "balanced", name: "Balanced" },
          { id: "creative", name: "Creative" },
        ],
      },
    ],
  },

  /*
   * Qoder CLI — not yet implemented.
   * TODO:
   *   - Confirm headless CLI args.
   *   - Write QoderParser implementing CliParser.
   *   - Register in cli-manager.ts PARSERS map.
   *   - Add renderer-side config + settings component.
   */
  qoder: {
    id: "qoder",
    name: "Qoder CLI",
    description: "Qoder CLI",
    binary: "qoder",
    args: [],
    placeholder: true,
    settings: [
      {
        key: "model",
        type: "model",
        label: "Model",
        options: [
          { id: null, name: "Default" },
          { id: "llama-4", name: "Llama 4", desc: "Latest Meta model" },
          { id: "mixtral", name: "Mixtral", desc: "Mixture of experts" },
        ],
      },
    ],
  },
};

export const DEFAULT_AGENT_ID = "claude";

export function getAgentConfig(id: string): AgentConfig | undefined {
  return AGENTS[id];
}

export function getAvailableAgents(): AgentConfig[] {
  return Object.values(AGENTS).filter((a) => !a.placeholder);
}

export function getAllAgents(): AgentConfig[] {
  return Object.values(AGENTS);
}
