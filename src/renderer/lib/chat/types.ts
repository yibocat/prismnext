import type { ContentBlock as ConversationContentBlock } from "@shared/agent/conversation";
import type { ComposerPart } from "./composer-parts";

/** Chat UI block: shared Conversation timeline plus composer inline tokens. */
export interface ContentBlock extends ConversationContentBlock {
  /** Inline @file / @profile / /command tokens in user message order */
  inlineParts?: ComposerPart[];
}

export interface ChatStreamMessage {
  type: "system" | "assistant" | "user" | "result" | "action-status" | "plan-decision" | "plan-artifact";
  subtype?: string;
  session_id?: string;
  message?: {
    content?: ContentBlock[];
    usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  };
  usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  cost_usd?: number;
  duration_ms?: number;
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  /** For "action-status" messages: the action key (e.g. "compile-document") */
  action?: string;
  /** For "action-status" messages: display name (e.g. "compile") */
  actionName?: string;
  /** For "action-status" messages: execution status */
  status?: "running" | "success" | "error";
  /** For "plan-decision" messages: user confirmed or rejected the draft. */
  planDecision?: "approved" | "rejected";
  /** Optional plan title / path shown on plan-decision / plan-artifact cards. */
  planTitle?: string;
  planPath?: string;
  /** True when Deny discarded the draft — card stays but is not openable. */
  planDiscarded?: boolean;
  /** True when the assistant turn was interrupted by the user (cancel/stop).
   *  The partial reply is still committed to `messages` (rather than discarded)
   *  so the user keeps what streamed so far; this flag marks it as incomplete. */
  stopped?: boolean;
  /**
   * True when this assistant message is a turn-failure body (OpenCode/provider
   * error or Prism turn failure) printed into the reply stream — enables Retry
   * without a separate error banner.
   */
  turnError?: boolean;
}

/** Safely iterate content blocks, handling both array and string formats. */
export function contentBlocks(
  content: string | ContentBlock[] | undefined,
): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}
