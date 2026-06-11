import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";

export interface CliSession {
  child: ChildProcess;
  stdin: Writable;
  sessionId: string;
  agentId: string;
  cwd: string;
  status: "idle" | "busy";
  createdAt: number;
  /** Agent settings that were active when this process was spawned.
   *  If any of these change between turns, the persistent process is
   *  killed and a new one is spawned with the updated flags/env.
   *  Keys are agent-specific (Claude: model, effort, agentMode;
   *  Gemini: model, temperature; etc.). CliManager treats this as
   *  opaque — only the agent's applySettings() interprets it. */
  settings?: Readonly<Record<string, string | null>>;
  /**
   * The Claude session ID that was passed to --resume when this
   * process was spawned.  `undefined` means the process was started
   * without --resume (fresh session).  `null` means the process was
   * started with --resume but the Claude session ID is not yet known
   * (edge case during initial handshake).
   *
   * Used by ensureProcess() to detect when the caller's sessionId
   * differs from what the running process was configured with — in
   * that case the old process is killed and a new one spawned with
   * the correct --resume flag.
   */
  resumedSessionId?: string | null;
}

export interface CliParser {
  /** Parse one line of CLI output (NDJSON). Returns parsed message or null to skip. */
  parse(line: string): Record<string, unknown> | null;
  /** Reset internal state (call before new prompt / after cancel). */
  reset(): void;

  /**
   * Total context window consumption for the most recent turn.
   *
   * Formula: uncached_input + cache_creation + cache_read
   *
   * This is used by CliManager to send a fast context update via cli:complete.
   * The renderer also computes this independently from assistant.message.usage
   * (see projectActiveTab / computeContextTokens in chat-store.ts), so even if
   * this getter returns null the ring still works. It's a best-effort fast path.
   *
   * ## Per-Agent Implementation Guide
   *
   * Claude / Gemini (prompt caching):
   *   total = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
   *   input_tokens alone is only the UN-CACHED portion and will UNDER-COUNT.
   *
   * OpenAI / Qoder (no prompt caching):
   *   total = input_tokens  (cache fields are always 0)
   *
   * Returns null when no token data has been received yet (e.g. before the
   * first message_start / usage chunk arrives, or after reset() without a new
   * turn). A null return is safe — the renderer falls back to Path ①.
   *
   * @see memory/context-ring-architecture.md — full data flow documentation
   */
  totalContextTokens: number | null;
}
