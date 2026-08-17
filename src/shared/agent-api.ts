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
  /** Composer `/` MCP names for this turn. Empty / omitted = only autoStart servers. */
  mcpServerAllowlist?: string[];
}

export interface AgentSendResult {
  ok: boolean;
  error?: string;
}

export interface AgentCancelSubagentInput {
  conversationId: string;
  toolCallId: string;
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
  planEvents?: AgentPlanEvent[];
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

export interface AgentModelRow {
  id: string;
  name: string;
  contextWindow: string;
  capabilities?: { vision?: boolean };
  description?: string;
  efforts?: string[];
}

export interface AgentListModelsInput {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AgentListModelsResult {
  models: AgentModelRow[];
  source: "pi" | "api";
}

export interface AgentModelsCatalogSnapshot {
  entries: Record<string, AgentModelRow[]>;
  fetchedAt: number;
}

export interface AgentTestConnectionInput {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}

export interface AgentTestConnectionResult {
  success: boolean;
  models?: string[];
}

export interface AgentModelEffortInput {
  provider: string;
  modelId: string;
  fallback?: string[] | null;
}

export interface AgentModelEffortResult {
  efforts: string[];
  source: "pi" | "fallback" | "none";
}

export interface AgentEffortCatalogSnapshot {
  entries: Record<string, string[]>;
  fetchedAt: number;
}

export interface AgentCompactInput {
  conversationId: string;
}

export interface AgentCompactResult {
  ok: boolean;
  summary?: string;
  tokensBefore?: number;
  error?: string;
}

export interface AgentDescribeImagesInput {
  providerId: string;
  modelId: string;
  images: Array<{ name: string; mimeType: string; data: string; uri?: string }>;
}

export interface AgentDescribeImagesResult {
  descriptions: Array<{ name: string; text: string; cached: boolean }>;
}

export interface AgentTruncateInput {
  conversationId: string;
  /** Inclusive keep-through turn index. `-1` clears every turn. */
  turnIndex: number;
}

export interface AgentTruncateResult {
  ok: boolean;
  keptCount?: number;
  error?: string;
}

export interface AgentUndoTruncateInput {
  conversationId: string;
}

export interface AgentUndoTruncateResult {
  ok: boolean;
  restoredCount?: number;
  error?: string;
}

export interface AgentReassignDirectoryInput {
  fromDirectory: string;
  toDirectory: string;
}

export interface AgentReassignDirectoryResult {
  count: number;
}

export interface AgentSyncIntensiveReadingInput {
  conversationId: string;
  projectRoot: string;
  paperIds?: string[];
}

export type AgentPlanEvent =
  | {
      kind: "plan-artifact";
      path: string;
      title?: string;
      discarded?: boolean;
      afterIndex: number;
    }
  | {
      kind: "plan-decision";
      decision: "approved" | "rejected";
      path?: string;
      title?: string;
      afterIndex: number;
    };

export interface AgentPlanArtifactInput {
  conversationId: string;
  event: Extract<AgentPlanEvent, { kind: "plan-artifact" }>;
}

export interface AgentPlanDecisionInput {
  conversationId: string;
  event: Extract<AgentPlanEvent, { kind: "plan-decision" }>;
}

export interface AgentTurnMetaInput {
  conversationId: string;
  turnIndex: number;
  meta: {
    completedAt?: number;
    modelLabel?: string;
    summary?: string;
  };
}

export type AgentRendererEvent = AgentEvent;
