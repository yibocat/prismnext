/**
 * Product-facing Agent IPC contract.
 *
 * The only runtime behind this API is Pi. Engine-specific Pi session ids stay
 * in main and never become renderer conversation or history keys.
 */

import type { Conversation } from "./agent-conversation";
import type { AgentEvent } from "./agent-runtime";
import type { PermissionMode } from "./session-agent";

export type ChatRuntimeKind = "pi" | "opencode";

export function isAgentRuntime(runtime?: string | null): boolean {
  return runtime === "pi";
}

export interface AgentAuthInput {
  provider?: string;
  modelId?: string;
  apiKey?: string;
  settings: {
    aiProvider?: string;
    aiModel?: string | null;
    aiApiKeys?: Record<string, string>;
  };
}

export type AgentAuthResult =
  | { ok: true; provider: string; modelId: string; apiKey: string }
  | { ok: false; reason: string };

export interface AgentRosterEntrySummary {
  fqid: string;
  name: string;
  available: boolean;
  unavailableReason?: string;
}

export interface AgentStatus {
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
  roster?: AgentRosterEntrySummary[];
  tools: string[];
  permissionMode: PermissionMode;
}

export interface AgentSendInput {
  conversationId: string;
  tabId: string;
  turnId: string;
  projectRoot: string;
  text: string;
  sessionTeamId?: string;
  provider?: string;
  modelId?: string;
  apiKey?: string;
  permissionMode?: PermissionMode;
}

export interface AgentSendResult {
  ok: boolean;
  error?: string;
}

export interface AgentSessionSummary {
  conversationId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  directory?: string;
}

export interface AgentLoadSessionInput {
  conversationId: string;
  projectRoot: string;
}

export interface AgentLoadSessionResult {
  ok: boolean;
  conversationId?: string;
  title?: string;
  conversation?: Conversation;
  directory?: string;
  error?: string;
}

export interface AgentRenameSessionInput {
  conversationId: string;
  title: string;
}

export type AgentRendererEvent = AgentEvent;
