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

export interface AgentSendAttachment {
  name: string;
  kind: "image" | "file";
  path: string;
}

export interface AgentSendInput {
  conversationId: string;
  /** UI window id. Defaults to conversationId. Not a product primary key. */
  tabId?: string;
  turnId: string;
  projectRoot: string;
  text: string;
  attachments?: AgentSendAttachment[];
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

export interface AgentDeleteSessionInput {
  conversationId: string;
}

export interface AgentAnswerQuestionInput {
  requestId: string;
  answer?: string;
  selected?: string[];
}

export interface AgentResolvePlanSuggestInput {
  requestId: string;
  decision: "accept" | "dismiss";
}

export type AgentRendererEvent = AgentEvent;
