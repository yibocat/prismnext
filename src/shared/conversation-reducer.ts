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
} from "./agent-conversation";
import type { AgentEvent } from "./agent-runtime";
import {
  applyAssistantEventToBlocks,
  applySubagentEventToRuns,
  contentBlockPlainText,
  collectTaskRunsFromBlocks,
  sealTurnBlockTimings,
  taskExpertIdFromInput,
  taskPromptFromInput,
} from "./conversation-blocks";

export { emptyConversation };

/** Incremental turn events that must never create or replace a live turn on their own. */
const LATE_DROPPABLE_EVENTS = new Set<AgentEvent["type"]>([
  "text_delta",
  "thinking_delta",
  "tool_started",
  "tool_progress",
  "tool_finished",
]);

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

  // Child streams outlive the parent live turn. Never drop them as "late".
  if (event.subagent) {
    return applySubagentEvent(marked, event);
  }

  // Late/stale-turn guards — a turn settles (live → null) the moment a terminal
  // event lands, but Pi can deliver incremental deltas afterwards (text/thinking/
  // tool events) or stale events from a previous turn while a newer one streams.
  // Without these guards `ensureLive` would rebuild a ghost live turn (empty user
  // bubble, isStreaming stuck true) or overwrite the newer turn.
  if (LATE_DROPPABLE_EVENTS.has(event.type)) {
    if (!conv.live) {
      if (
        (event.type === "tool_started" || event.type === "tool_finished")
        && event.toolName === "task"
      ) {
        return event.type === "tool_started"
          ? seedTaskRun(marked, event)
          : completeTaskRun(marked, event);
      }
      return conv;
    }
    if (conv.live.turnId !== event.turnId) return conv;
  }
  if (
    (event.type === "turn_finished" || event.type === "turn_cancelled" || event.type === "turn_failed")
    && !conv.live
  ) {
    return conv;
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
          ...(typeof event.windowSize === "number" ? { windowSize: event.windowSize } : {}),
          ...(typeof event.costUsd === "number" ? { costUsd: event.costUsd } : {}),
          ...(event.breakdown ? { breakdown: event.breakdown } : {}),
        },
      };
    case "text_delta":
    case "thinking_delta":
    case "tool_progress":
      return appendAssistantBlock(ensureLive(marked, event), (blocks) => applyAssistantEventToBlocks(blocks, event));
    case "tool_started": {
      const withTool = appendAssistantBlock(
        ensureLive(marked, event),
        (blocks) => applyAssistantEventToBlocks(blocks, event),
      );
      return event.toolName === "task" ? seedTaskRun(withTool, event) : withTool;
    }
    case "tool_finished": {
      const withTool = appendAssistantBlock(
        ensureLive(marked, event),
        (blocks) => applyAssistantEventToBlocks(blocks, event),
      );
      const settled = event.toolName === "question"
        && withTool.pendingQuestion?.requestId === event.toolCallId
        ? { ...withTool, pendingQuestion: null }
        : withTool;
      return event.toolName === "task" ? completeTaskRun(settled, event) : settled;
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

function applySubagentEvent(conv: Conversation, event: AgentEvent): Conversation {
  const next: Conversation = {
    ...conv,
    subagentRuns: applySubagentEventToRuns(conv.subagentRuns ?? {}, event),
  };
  if (event.type === "plan_suggested") {
    return {
      ...next,
      pendingPlanSuggest: {
        requestId: event.requestId,
        reason: event.reason,
      },
    };
  }
  return next;
}

function seedTaskRun(
  conv: Conversation,
  event: Extract<AgentEvent, { type: "tool_started" }>,
): Conversation {
  const expertId = taskExpertIdFromInput(event.args);
  const prompt = taskPromptFromInput(event.args);
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
  const existing = (conv.subagentRuns ?? {})[event.toolCallId] ?? {
    parentToolCallId: event.toolCallId,
    expertFqid: "",
    expertName: "",
    status: "running" as const,
    blocks: [] as ContentBlock[],
  };
  const failed = Boolean(event.error || event.denied || !event.ok);
  if (!failed && existing.status === "error") return conv;
  const fallback = !failed && existing.blocks.length === 0
    ? contentBlockPlainText(event.result)
    : "";
  return putSubagentRun(conv, {
    ...existing,
    status: failed ? "error" : "done",
    ...(failed
      ? { error: event.error || existing.error || "subagent_failed" }
      : fallback
        ? { blocks: [{ type: "text", text: fallback }] }
        : {}),
  });
}

export function ensureTaskRunFromTranscript(
  conv: Conversation,
  toolUseId: string,
): Conversation {
  const existing = conv.subagentRuns?.[toolUseId];
  if (existing && (existing.blocks.length > 0 || existing.error || existing.status === "running")) {
    return conv;
  }
  const sources = [
    conv.live?.assistant.blocks ?? [],
    ...conv.turns.map((turn) => turn.assistant.blocks),
  ];
  for (const blocks of sources) {
    const run = collectTaskRunsFromBlocks(blocks).find((item) => item.parentToolCallId === toolUseId);
    if (!run) continue;
    return putSubagentRun(conv, {
      ...run,
      ...(existing?.blocks.length ? { blocks: existing.blocks } : {}),
      ...(existing?.error ? { error: existing.error } : {}),
      expertFqid: existing?.expertFqid || run.expertFqid,
      expertName: existing?.expertName || run.expertName,
      prompt: existing?.prompt || run.prompt,
    });
  }
  return conv;
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

/** Host chrome (e.g. Plan-approve TodoWrite) lands on the current turn, not a ChatStream row. */
export function appendAssistantBlocksToLastTurn(
  conv: Conversation,
  blocks: ContentBlock[],
): Conversation {
  if (blocks.length === 0) return conv;
  if (conv.live) {
    return {
      ...conv,
      live: {
        ...conv.live,
        assistant: { blocks: [...conv.live.assistant.blocks, ...blocks] },
      },
    };
  }
  const last = conv.turns.at(-1);
  if (!last) return conv;
  return {
    ...conv,
    turns: [
      ...conv.turns.slice(0, -1),
      { ...last, assistant: { blocks: [...last.assistant.blocks, ...blocks] } },
    ],
  };
}

function resolveAnsweredQuestionToolId(conv: Conversation, requestId: string): string | null {
  const blocks = [
    ...(conv.live?.assistant.blocks ?? []),
    ...(conv.turns.at(-1)?.assistant.blocks ?? []),
  ];
  if (blocks.some((block) => block.type === "tool_use" && block.id === requestId)) {
    return requestId;
  }
  return null;
}

function applyQuestionAnswerToBlocks(
  blocks: ContentBlock[],
  toolCallId: string,
  answer: string,
): ContentBlock[] {
  return applyAssistantEventToBlocks(blocks, {
    type: "tool_finished",
    runtimeSessionId: "",
    tabId: "",
    turnId: "",
    toolCallId,
    toolName: "question",
    ok: true,
    result: answer,
  });
}

/** User answered the hang — drop chrome immediately; later tool_finished is idempotent. */
export function acknowledgeQuestionAnswer(
  conv: Conversation,
  requestId: string,
  answer: string,
): Conversation {
  const cleared: Conversation = { ...conv, pendingQuestion: null };
  const toolCallId = resolveAnsweredQuestionToolId(cleared, requestId);
  if (!toolCallId) return cleared;
  if (cleared.live) {
    return {
      ...cleared,
      live: {
        ...cleared.live,
        assistant: {
          blocks: applyQuestionAnswerToBlocks(cleared.live.assistant.blocks, toolCallId, answer),
        },
      },
    };
  }
  const last = cleared.turns.at(-1);
  if (!last) return cleared;
  return {
    ...cleared,
    turns: [
      ...cleared.turns.slice(0, -1),
      {
        ...last,
        assistant: {
          blocks: applyQuestionAnswerToBlocks(last.assistant.blocks, toolCallId, answer),
        },
      },
    ],
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
    assistant: { blocks: sealTurnBlockTimings(conv.live.assistant.blocks) },
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
