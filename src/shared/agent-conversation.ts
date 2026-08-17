/**
 * Product conversation document — independent of Pi / OpenCode engine ids.
 *
 * AgentEvent remains the incremental protocol. Conversation is the
 * persistable projection the UI and hydrator share.
 */

export type ConversationId = string;
export type ConversationBackend = "pi" | "opencode" | "in-process";

export interface ConversationAttachment {
  name: string;
  kind: "image" | "file";
  path: string;
  previewUrl?: string;
  note?: string;
}

/**
 * Timeline block for a conversation message.
 * OpenCode-only fields stay optional UI hints; projection must not depend on them.
 */
export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking" | "command" | "profile";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
  status?: string;
  title?: string;
  kind?: string;
  duration?: number;
  timeStart?: number;
  timeEnd?: number;
  attachments?: ConversationAttachment[];
  profileId?: string;
  action?: string;
  signature?: string;
  /** OpenCode init progress — optional UI hint. */
  _progress?: boolean;
  _backfillInput?: Record<string, unknown> | null;
  _backfillName?: string | null;
  locations?: Array<{ file: string; line?: number }>;
}

export interface TurnMessageMeta {
  completedAt?: number;
  modelLabel?: string;
  summary?: string;
}

export interface ConversationUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ConversationMessage {
  blocks: ContentBlock[];
}

export interface ConversationTurn {
  turnId: string;
  turnIndex: number;
  user: ConversationMessage;
  assistant: ConversationMessage;
  status: "streaming" | "completed" | "failed" | "cancelled";
  meta?: TurnMessageMeta;
  error?: string;
}

export interface LiveTurn {
  turnId: string;
  turnIndex: number;
  user: ConversationMessage;
  assistant: ConversationMessage;
  status: "streaming";
}

export interface PendingQuestion {
  requestId: string;
  prompt: string;
  options?: string[];
}

export interface Conversation {
  conversationId: ConversationId;
  title: string;
  turns: ConversationTurn[];
  live: LiveTurn | null;
  usage: ConversationUsage | null;
  pendingQuestion: PendingQuestion | null;
  appliedEventIds: string[];
}

/**
 * Engine binding for a product conversation.
 * `runtimeSessionId` / `openCodeSessionId` must never become UI or history keys.
 */
export interface ConversationBinding {
  conversationId: ConversationId;
  tabId: string;
  runtimeSessionId?: string;
  openCodeSessionId?: string;
  piSessionFile?: string;
  backend: ConversationBackend;
}

export function newConversationId(): ConversationId {
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyConversation(input: {
  conversationId: ConversationId;
  title?: string;
}): Conversation {
  return {
    conversationId: input.conversationId,
    title: input.title ?? "New Chat",
    turns: [],
    live: null,
    usage: null,
    pendingQuestion: null,
    appliedEventIds: [],
  };
}
