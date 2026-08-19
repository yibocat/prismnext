/**
 * Session Hydrator — AgentSessionRecord → Conversation.
 */

import {
  emptyConversation,
  type ContentBlock,
  type Conversation,
  type ConversationSubagentRun,
  type ConversationTurn,
} from "../../shared/agent-conversation";
import { collectTaskRunsFromBlocks } from "../../shared/conversation-blocks";
import type { AgentSessionRecord, AgentTurnRecord } from "./session-store";
import { usageTotalsFromTurns } from "../../shared/agent-context-usage";

function assistantBlocksFromTurn(turn: AgentTurnRecord): ContentBlock[] {
  if (Array.isArray(turn.assistant.blocks) && turn.assistant.blocks.length > 0) {
    return turn.assistant.blocks.slice();
  }
  const blocks: ContentBlock[] = [];
  if (turn.assistant.thinking) {
    blocks.push({ type: "thinking", thinking: turn.assistant.thinking });
  }
  for (const tc of turn.assistant.toolCalls) {
    const isError = Boolean(tc.error || tc.denied);
    const status = isError ? "failed" : "completed";
    blocks.push({
      type: "tool_use",
      id: tc.toolCallId,
      name: tc.toolName,
      input: tc.args,
      status,
    });
    blocks.push({
      type: "tool_result",
      tool_use_id: tc.toolCallId,
      name: tc.toolName,
      content: isError ? tc.error || "Execution denied or failed" : tc.result,
      is_error: isError,
      status,
    });
  }
  if (turn.assistant.text) {
    blocks.push({ type: "text", text: turn.assistant.text });
  }
  return blocks;
}

export function hydrateSessionRecordToConversation(
  record: AgentSessionRecord,
): Conversation {
  const conversationId = record.conversationId || record.runtimeSessionId;
  const turns: ConversationTurn[] = [...(record.turns ?? [])]
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .map((turn) => ({
      turnId: turn.turnId,
      turnIndex: turn.turnIndex,
      user: {
        blocks: [{
          type: "text",
          text: turn.user.text,
          ...(turn.user.attachments?.length ? { attachments: turn.user.attachments } : {}),
        }],
      },
      assistant: { blocks: assistantBlocksFromTurn(turn) },
      status: turn.status,
      ...(turn.meta ? { meta: turn.meta } : {}),
      ...(turn.error ? { error: turn.error } : {}),
    }));
  const subagentRuns: Record<string, ConversationSubagentRun> = {
    ...(record.subagentRuns ?? {}),
  };
  for (const turn of turns) {
    for (const run of collectTaskRunsFromBlocks(turn.assistant.blocks)) {
      const existing = subagentRuns[run.parentToolCallId];
      if (existing?.blocks.length) continue;
      subagentRuns[run.parentToolCallId] = run;
    }
  }
  return {
    ...emptyConversation({ conversationId, title: record.title }),
    turns,
    subagentRuns,
    ...(record.compacted ? { compacted: record.compacted } : {}),
    usage: conversationUsageFromRecord(record),
  };
}

function conversationUsageFromRecord(record: AgentSessionRecord) {
  const totals = record.usageTotals ?? usageTotalsFromTurns(record.turns ?? []);
  if (!totals) return null;
  return {
    ...(totals.occupancyTokens != null ? { inputTokens: totals.occupancyTokens } : {}),
    outputTokens: totals.output,
    cacheReadTokens: totals.cacheRead,
    cacheWriteTokens: totals.cacheWrite,
    ...(totals.windowSize != null ? { windowSize: totals.windowSize } : {}),
    ...(typeof totals.costUsd === "number" ? { costUsd: totals.costUsd } : {}),
    ...(totals.breakdown ? { breakdown: totals.breakdown } : {}),
  };
}
