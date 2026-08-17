/**
 * Isolated Pi Agent Lab contract.
 * Production chat (`chat:send` / ACP) must not import this.
 */

import type { AgentEvent } from "./agent-runtime";
import type { PermissionMode } from "./session-agent";

export const PI_LAB_TAB_ID = "pi-lab";

export type ChatRuntimeKind = "opencode" | "pi";

export function isExperimentalPiRuntime(runtime?: string | null): boolean {
  return runtime === "pi";
}

export function shouldShowExperimentalPiNav(input: { isDev: boolean }): boolean {
  return input.isDev;
}

/** OpenCode catalog ids are blocked. Direct BYOK vendors (DeepSeek, Anthropic, …) are allowed. */
export const PI_LAB_SUPPORTED_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "minimax",
] as const;

export type PiLabSupportedProvider = string;

export interface PiLabAuthInput {
  provider?: string;
  modelId?: string;
  apiKey?: string;
  settings: {
    aiProvider?: string;
    aiModel?: string | null;
    aiApiKeys?: Record<string, string>;
  };
}

export type PiLabAuthResult =
  | { ok: true; provider: PiLabSupportedProvider; modelId: string; apiKey: string }
  | { ok: false; reason: string };

export interface PiLabRosterEntrySummary {
  fqid: string;
  name: string;
  available: boolean;
  unavailableReason?: string;
}

export interface PiLabStatus {
  ready: boolean;
  reason?: string;
  sdk: string;
  nodeVersion: string;
  electronVersion: string;
  canEmbed: boolean;
  provider?: string;
  modelId?: string;
  hasApiKey: boolean;
  projectRoot?: string | null;
  sessionId?: string | null;
  teamId?: string;
  leadName?: string;
  leadFqid?: string;
  roster?: PiLabRosterEntrySummary[];
  tools: string[];
  permissionMode: PermissionMode;
}

export interface PiLabSendInput {
  projectRoot: string;
  text: string;
  tabId?: string;
  sessionTeamId?: string;
  provider?: string;
  modelId?: string;
  apiKey?: string;
  permissionMode?: PermissionMode;
}

export interface PiLabSendResult {
  ok: boolean;
  error?: string;
  sessionId?: string;
}

export type PiLabEvent = AgentEvent;
