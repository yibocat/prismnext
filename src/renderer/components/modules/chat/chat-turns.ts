import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";
import { contentBlocks } from "./tools/tool-result-map";
import { partsToPlainText, type ComposerPart } from "@/lib/chat/composer-parts";

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

/** Hidden `type: result` rows that only carry tool_result for toolResultMap. */
export function isHiddenToolResultCarrier(msg: ChatStreamMessage): boolean {
  if (msg.type !== "result" || msg.is_error) return false;
  if (msg.usage || msg.result) return false;
  const blocks = contentBlocks(msg.message?.content);
  if (blocks.length === 0) return false;
  return blocks.every((b) => b.type === "tool_result");
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

/** Short preview of a turn's user message - mirrors UserHeader extraction logic
 *  (inline @ tokens -> plain text, filters system-injected Role/Core Rules blocks). */
export interface TurnUserPreview {
  text: string;
  hasAttachments: boolean;
}

export function extractTurnUserPreview(
  userMessage: ChatStreamMessage | null | undefined,
): TurnUserPreview {
  if (!userMessage) return { text: "", hasAttachments: false };
  const allBlocks = contentBlocks(userMessage.message?.content);
  const inlineParts: ComposerPart[] = [];
  let hasAttachments = false;
  for (const b of allBlocks) {
    if (b.type === "text" && b.inlineParts?.length) {
      inlineParts.push(...b.inlineParts);
    }
    if (b.type === "text" && b.attachments?.length) {
      hasAttachments = true;
    }
  }
  const hasInline = inlineParts.length > 0;
  const text = hasInline
    ? partsToPlainText(inlineParts)
    : allBlocks
        .filter((b) => {
          if (b.type !== "text" || !b.text) return false;
          const t = b.text;
          if (
            t.startsWith("## Role") &&
            (t.includes("integrated into prismnext") ||
              t.includes("integrated into Prism") ||
              t.includes("LaTeX academic paper writing workspace") ||
              t.includes("## Core Rules"))
          ) {
            return false;
          }
          return true;
        })
        .map((b) => b.text)
        .join("\n");
  return { text: text ?? "", hasAttachments };
}
