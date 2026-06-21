import type { ChatStreamMessage } from "@/stores/chat-store";

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
