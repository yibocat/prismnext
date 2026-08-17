/**
 * Session Hydrator — AgentSessionRecord → Conversation.
 */

import {
  emptyConversation,
  type ContentBlock,
  type Conversation,
  type ConversationTurn,
} from "../../shared/agent-conversation";
import type { AgentSessionRecord, AgentTurnRecord } from "./session-store";

function assistantBlocksFromTurn(turn: AgentTurnRecord): ContentBlock[] {
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
      ...(turn.error ? { error: turn.error } : {}),
    }));
  return {
    ...emptyConversation({ conversationId, title: record.title }),
    turns,
  };
}
