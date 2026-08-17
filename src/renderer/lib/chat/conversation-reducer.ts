/**
 * Pure AgentEvent → Conversation projection.
 * The only writer of conversation turns. Does not import Pi, ACP, or chat-store.
 */

import {
  emptyConversation,
  type ContentBlock,
  type Conversation,
  type ConversationTurn,
  type LiveTurn,
} from "../../../shared/agent-conversation";
import type { AgentEvent } from "../../../shared/agent-runtime";

export { emptyConversation };

export function beginConversationTurn(
  conv: Conversation,
  input: { turnId: string; userText: string },
): Conversation {
  return {
    ...conv,
    pendingQuestion: null,
    live: {
      turnId: input.turnId,
      turnIndex: conv.turns.length,
      user: { blocks: [{ type: "text", text: input.userText }] },
      assistant: { blocks: [] },
      status: "streaming",
    },
  };
}

export function applyConversationEvent(
  conv: Conversation,
  event: AgentEvent,
): Conversation {
  if (event.eventId && conv.appliedEventIds.includes(event.eventId)) {
    return conv;
  }

  const marked = event.eventId
    ? { ...conv, appliedEventIds: [...conv.appliedEventIds, event.eventId] }
    : conv;

  if (event.subagent) {
    return marked;
  }

  switch (event.type) {
    case "session_created":
    case "prepare_phase":
    case "permission_requested":
      return marked;
    case "question_requested":
      return {
        ...marked,
        pendingQuestion: {
          requestId: event.requestId,
          prompt: event.prompt,
          options: event.options,
        },
      };
    case "usage_updated":
      return {
        ...marked,
        usage: {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        },
      };
    case "text_delta":
      return appendAssistantBlock(ensureLive(marked, event), (blocks) => appendText(blocks, event.text));
    case "thinking_delta":
      return appendAssistantBlock(ensureLive(marked, event), (blocks) => appendThinking(blocks, event.text));
    case "tool_started":
      return appendAssistantBlock(ensureLive(marked, event), (blocks) => upsertToolUse(blocks, {
        type: "tool_use",
        id: event.toolCallId,
        name: event.toolName,
        input: event.args,
        status: "running",
      }));
    case "tool_progress":
      return appendAssistantBlock(ensureLive(marked, event), (blocks) => updateToolUse(blocks, event.toolCallId, {
        title: event.text,
        status: "running",
      }));
    case "tool_finished":
      return appendAssistantBlock(ensureLive(marked, event), (blocks) => finishTool(blocks, event));
    case "turn_finished":
      return commitLive(marked, "completed");
    case "turn_cancelled":
      return commitLive(marked, "cancelled");
    case "turn_failed":
      return commitLive(
        appendAssistantBlock(ensureLive(marked, event), (blocks) => [
          ...blocks,
          { type: "text", text: event.error, is_error: true },
        ]),
        "failed",
        event.error,
      );
    default:
      return marked;
  }
}

function ensureLive(conv: Conversation, event: AgentEvent): Conversation {
  if (conv.live && conv.live.turnId === event.turnId) return conv;
  const live: LiveTurn = {
    turnId: event.turnId,
    turnIndex: conv.turns.length,
    user: { blocks: [] },
    assistant: { blocks: [] },
    status: "streaming",
  };
  return { ...conv, live };
}

function appendAssistantBlock(
  conv: Conversation,
  update: (blocks: ContentBlock[]) => ContentBlock[],
): Conversation {
  if (!conv.live) return conv;
  return {
    ...conv,
    live: {
      ...conv.live,
      assistant: { blocks: update(conv.live.assistant.blocks) },
    },
  };
}

function appendText(blocks: ContentBlock[], text: string): ContentBlock[] {
  const last = blocks.at(-1);
  if (last?.type === "text" && !last.is_error) {
    return [...blocks.slice(0, -1), { ...last, text: `${last.text ?? ""}${text}` }];
  }
  return [...blocks, { type: "text", text }];
}

function appendThinking(blocks: ContentBlock[], text: string): ContentBlock[] {
  const last = blocks.at(-1);
  if (last?.type === "thinking") {
    return [...blocks.slice(0, -1), { ...last, thinking: `${last.thinking ?? ""}${text}` }];
  }
  return [...blocks, { type: "thinking", thinking: text }];
}

function upsertToolUse(blocks: ContentBlock[], block: ContentBlock): ContentBlock[] {
  const idx = blocks.findIndex((item) => item.type === "tool_use" && item.id === block.id);
  if (idx >= 0) {
    const next = blocks.slice();
    next[idx] = { ...next[idx], ...block };
    return next;
  }
  return [...blocks, block];
}

function updateToolUse(
  blocks: ContentBlock[],
  toolCallId: string,
  patch: Partial<ContentBlock>,
): ContentBlock[] {
  return blocks.map((block) => (
    block.type === "tool_use" && block.id === toolCallId
      ? { ...block, ...patch }
      : block
  ));
}

function finishTool(
  blocks: ContentBlock[],
  event: Extract<AgentEvent, { type: "tool_finished" }>,
): ContentBlock[] {
  const status = event.ok && !event.denied ? "completed" : "failed";
  const withUse = updateToolUse(blocks, event.toolCallId, { status });
  const hasResult = withUse.some((block) => (
    block.type === "tool_result" && block.tool_use_id === event.toolCallId
  ));
  if (hasResult) return withUse;
  return [
    ...withUse,
    {
      type: "tool_result",
      tool_use_id: event.toolCallId,
      name: event.toolName,
      content: event.error ?? event.result,
      is_error: Boolean(event.error || event.denied || !event.ok),
      status,
    },
  ];
}

function commitLive(
  conv: Conversation,
  status: ConversationTurn["status"],
  error?: string,
): Conversation {
  if (!conv.live) return conv;
  const turn: ConversationTurn = {
    turnId: conv.live.turnId,
    turnIndex: conv.live.turnIndex,
    user: conv.live.user,
    assistant: conv.live.assistant,
    status,
    ...(error ? { error } : {}),
  };
  return {
    ...conv,
    turns: [...conv.turns, turn],
    live: null,
    pendingQuestion: null,
  };
}
