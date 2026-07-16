import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";

/** Restore prismnext UI display (inline @ / tokens) over OpenCode-stored user text. */
export function applyUserDisplaySnapshots(
  messages: ChatStreamMessage[],
  snapshots: ContentBlock[][],
): ChatStreamMessage[] {
  if (!snapshots.length) return messages;
  let snapIdx = 0;
  return messages.map((m) => {
    if (m.type !== "user" || isToolResultUserMessage(m)) return m;
    const snap = snapshots[snapIdx++];
    if (!snap?.length) return m;
    return { ...m, message: { content: snap } };
  });
}

/** User messages that are only tool_result blocks (hidden from turn UI). */
export function isToolResultUserMessage(msg: ChatStreamMessage): boolean {
  const content = msg.message?.content;
  if (!content) return false;
  if (typeof content === "string") return false;
  return content.every((b) => b.type === "tool_result");
}

/** Count visible user turns (matches chat-messages turn grouping). */
export function countUserTurns(messages: ChatStreamMessage[]): number {
  return messages.filter((m) => m.type === "user" && !isToolResultUserMessage(m)).length;
}

/** Keep messages through the end of turnIndex (0-based, matches chat-messages turns). */
export function truncateChatMessagesToTurn(
  messages: ChatStreamMessage[],
  turnIndex: number,
): ChatStreamMessage[] {
  let currentTurn = -1;
  const kept: ChatStreamMessage[] = [];
  for (const msg of messages) {
    if (msg.type === "user" && !isToolResultUserMessage(msg)) {
      currentTurn++;
    }
    if (currentTurn > turnIndex) break;
    kept.push(msg);
  }
  return kept;
}
