/**
 * Session Hydrator — Pure function transformer that converts
 * AgentSessionRecord (JSON) into ChatStreamMessage[] for the renderer UI.
 */

import type { AgentSessionRecord, AgentTurnRecord } from "./session-store";

export interface HydratedContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  status?: string;
  duration?: number;
  attachments?: Array<{
    name: string;
    kind: "image" | "file";
    path: string;
  }>;
}

export interface HydratedChatMessage {
  type: "user" | "assistant";
  message: {
    content: HydratedContentBlock[];
  };
}

export function hydrateTurnToChatMessages(turn: AgentTurnRecord): HydratedChatMessage[] {
  const messages: HydratedChatMessage[] = [];

  // 1. User Message
  const userContent: HydratedContentBlock[] = [
    {
      type: "text",
      text: turn.user.text,
      ...(turn.user.attachments && turn.user.attachments.length > 0
        ? { attachments: turn.user.attachments }
        : {}),
    },
  ];

  messages.push({
    type: "user",
    message: { content: userContent },
  });

  // 2. Assistant Message
  const assistantBlocks: HydratedContentBlock[] = [];

  // Thinking
  if (turn.assistant.thinking) {
    assistantBlocks.push({
      type: "thinking",
      thinking: turn.assistant.thinking,
    });
  }

  // Tool Calls & Results
  for (const tc of turn.assistant.toolCalls) {
    const isError = Boolean(tc.error || tc.denied);
    const status = isError ? "failed" : "completed";

    // tool_use
    assistantBlocks.push({
      type: "tool_use",
      id: tc.toolCallId,
      name: tc.toolName,
      input: tc.args,
      status,
    });

    // tool_result
    assistantBlocks.push({
      type: "tool_result",
      tool_use_id: tc.toolCallId,
      name: tc.toolName,
      content: isError ? tc.error || "Execution denied or failed" : tc.result,
      is_error: isError,
      status,
    });
  }

  // Final Assistant Text
  if (turn.assistant.text) {
    assistantBlocks.push({
      type: "text",
      text: turn.assistant.text,
    });
  }

  if (assistantBlocks.length > 0) {
    messages.push({
      type: "assistant",
      message: { content: assistantBlocks },
    });
  }

  return messages;
}

export function hydrateSessionRecordToChatMessages(
  record: AgentSessionRecord,
): HydratedChatMessage[] {
  if (!record.turns || record.turns.length === 0) return [];
  const sortedTurns = [...record.turns].sort((a, b) => a.turnIndex - b.turnIndex);
  return sortedTurns.flatMap((turn) => hydrateTurnToChatMessages(turn));
}
