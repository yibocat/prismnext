/**
 * Pure AgentEvent → Conversation projection.
 * The only writer of conversation turns. Does not import Pi, ACP, or chat-store.
 */

import {
  emptyConversation,
  type ContentBlock,
  type Conversation,
  type ConversationSubagentRun,
  type ConversationTurn,
  type LiveTurn,
} from "../../../shared/agent-conversation";
import type { AgentEvent } from "../../../shared/agent-runtime";

export { emptyConversation };

export function beginConversationTurn(
  conv: Conversation,
  input: { turnId: string; userText?: string; userBlocks?: ContentBlock[] },
): Conversation {
  const userBlocks = input.userBlocks?.length
    ? input.userBlocks
    : [{ type: "text" as const, text: input.userText ?? "" }];
  return {
    ...conv,
    pendingQuestion: null,
    pendingPlanSuggest: null,
    live: {
      turnId: input.turnId,
      turnIndex: conv.turns.length,
      user: { blocks: userBlocks },
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
    return applySubagentEvent(marked, event);
  }

  switch (event.type) {
    case "session_created":
    case "prepare_phase":
    case "permission_requested":
      return marked;
    case "plan_suggested":
      return {
        ...marked,
        pendingPlanSuggest: {
          requestId: event.requestId,
          reason: event.reason,
        },
      };
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
    case "tool_started": {
      const withTool = appendAssistantBlock(ensureLive(marked, event), (blocks) => upsertToolUse(blocks, {
        type: "tool_use",
        id: event.toolCallId,
        name: event.toolName,
        input: event.args,
        status: "running",
      }));
      return event.toolName === "task" ? seedTaskRun(withTool, event) : withTool;
    }
    case "tool_progress":
      return appendAssistantBlock(ensureLive(marked, event), (blocks) => updateToolUse(blocks, event.toolCallId, {
        title: event.text,
        status: "running",
      }));
    case "tool_finished": {
      const withTool = appendAssistantBlock(ensureLive(marked, event), (blocks) => finishTool(blocks, event));
      return event.toolName === "task" ? completeTaskRun(withTool, event) : withTool;
    }
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

function applySubagentEvent(conv: Conversation, event: AgentEvent): Conversation {
  const ctx = event.subagent;
  if (!ctx) return conv;
  const id = ctx.parentToolCallId;
  const existing = (conv.subagentRuns ?? {})[id];
  let run: ConversationSubagentRun = existing ?? {
    parentToolCallId: id,
    expertFqid: ctx.expertFqid,
    expertName: ctx.expertName,
    status: "running",
    blocks: [],
  };
  if (ctx.expertFqid) run = { ...run, expertFqid: ctx.expertFqid };
  if (ctx.expertName) run = { ...run, expertName: ctx.expertName };

  switch (event.type) {
    case "text_delta":
      run = { ...run, blocks: appendText(run.blocks, event.text) };
      break;
    case "thinking_delta":
      run = { ...run, blocks: appendThinking(run.blocks, event.text) };
      break;
    case "tool_started":
      run = {
        ...run,
        blocks: upsertToolUse(run.blocks, {
          type: "tool_use",
          id: event.toolCallId,
          name: event.toolName,
          input: event.args,
          status: "running",
        }),
      };
      break;
    case "tool_progress":
      run = {
        ...run,
        blocks: updateToolUse(run.blocks, event.toolCallId, {
          title: event.text,
          status: "running",
        }),
      };
      break;
    case "tool_finished":
      run = { ...run, blocks: finishTool(run.blocks, event) };
      break;
    case "turn_finished":
      if (run.status === "running" || run.status === "stopping") {
        run = { ...run, status: run.status === "stopping" ? "error" : "done" };
      }
      break;
    case "turn_cancelled":
      run = { ...run, status: "error", error: run.error || "cancelled" };
      break;
    case "turn_failed":
      run = { ...run, status: "error", error: event.error };
      break;
    case "question_requested":
      return putSubagentRun({
        ...conv,
        pendingQuestion: {
          requestId: event.requestId,
          prompt: event.prompt,
          options: event.options,
        },
      }, run);
    case "plan_suggested":
      return putSubagentRun({
        ...conv,
        pendingPlanSuggest: {
          requestId: event.requestId,
          reason: event.reason,
        },
      }, run);
    default:
      break;
  }
  return putSubagentRun(conv, run);
}

function seedTaskRun(
  conv: Conversation,
  event: Extract<AgentEvent, { type: "tool_started" }>,
): Conversation {
  const args = (event.args ?? {}) as Record<string, unknown>;
  const expertId = typeof args.expertId === "string" ? args.expertId.trim() : "";
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  const existing = (conv.subagentRuns ?? {})[event.toolCallId];
  const run: ConversationSubagentRun = {
    parentToolCallId: event.toolCallId,
    expertFqid: existing?.expertFqid || expertId,
    expertName: existing?.expertName || expertId,
    status: existing?.status === "done" || existing?.status === "error" ? existing.status : "running",
    blocks: existing?.blocks ?? [],
    prompt: existing?.prompt || prompt,
    ...(existing?.error ? { error: existing.error } : {}),
  };
  return putSubagentRun(conv, run);
}

function completeTaskRun(
  conv: Conversation,
  event: Extract<AgentEvent, { type: "tool_finished" }>,
): Conversation {
  const existing = (conv.subagentRuns ?? {})[event.toolCallId];
  if (!existing) return conv;
  if (existing.status === "done" || existing.status === "error") return conv;
  const failed = Boolean(event.error || event.denied || !event.ok);
  return putSubagentRun(conv, {
    ...existing,
    status: failed ? "error" : "done",
    ...(failed ? { error: event.error || existing.error || "subagent_failed" } : {}),
  });
}

function putSubagentRun(conv: Conversation, run: ConversationSubagentRun): Conversation {
  return {
    ...conv,
    subagentRuns: {
      ...(conv.subagentRuns ?? {}),
      [run.parentToolCallId]: run,
    },
  };
}

export function markSubagentStopping(conv: Conversation, toolCallId: string): Conversation {
  const existing = conv.subagentRuns?.[toolCallId];
  if (!existing || existing.status !== "running") return conv;
  return putSubagentRun(conv, { ...existing, status: "stopping" });
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
    pendingPlanSuggest: null,
  };
}
