import type { Conversation } from "./conversation";
import type { AgentEvent } from "./runtime";

export interface AgentSessionSummary {
  conversationId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  directory?: string;
}

export interface AgentListSessionsByProjectIdArgs {
  projectId: string;
  projectRoot?: string;
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

export interface AgentGenerateSessionTitleInput {
  conversationId: string;
  userText?: string;
  assistantText?: string;
}

export interface AgentGenerateSessionTitleResult {
  ok: boolean;
  title?: string;
  skipped?: boolean;
  error?: string;
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

export interface AgentCompactInput {
  conversationId: string;
}

export interface AgentCompactResult {
  ok: boolean;
  summary?: string;
  tokensBefore?: number;
  /** Exclusive: product turns below this index stay expanded. */
  throughTurnIndex?: number;
  error?: string;
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

export interface AgentReassignSessionProjectInput {
  conversationId: string;
  projectId: string;
  projectRoot: string;
}

export interface AgentReassignSessionProjectResult {
  ok: boolean;
  existed?: boolean;
  error?: string;
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
