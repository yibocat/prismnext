import { contentBlocks, type ChatStreamMessage, type ContentBlock } from "@/lib/chat/types";
import { partsToPlainText, type ComposerPart } from "@/lib/chat/composer-parts";
import { isBackgroundTaskInjectMessageText } from "@shared/chat/background-task";
import { isPlanControlUserText } from "@shared/research/plan";

function userMessagePlainTextForDisplay(msg: ChatStreamMessage): string {
  const content = msg.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text || "")
    .join("\n");
}

/** User bubbles that participate in display-snapshot pairing (visible turns). */
export function isDisplaySnapshotUserMessage(msg: ChatStreamMessage): boolean {
  if (msg.type !== "user") return false;
  if (isToolResultUserMessage(msg)) return false;
  if (isBackgroundTaskInjectUserMessage(msg)) return false;
  if (isPlanControlUserText(userMessagePlainTextForDisplay(msg))) return false;
  return true;
}

/**
 * Restore prismnext UI display (inline @ / tokens) over OpenCode-stored user text.
 * Pair by visible-user order. When counts differ, align from the **end** so a
 * later snapshot (e.g. 「继续」) cannot overwrite an earlier real user bubble.
 */
export function applyUserDisplaySnapshots(
  messages: ChatStreamMessage[],
  snapshots: ContentBlock[][],
): ChatStreamMessage[] {
  if (!snapshots.length) return messages;

  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (isDisplaySnapshotUserMessage(messages[i]!)) userIndices.push(i);
  }
  if (userIndices.length === 0) return messages;

  // Prefer newest snapshots ↔ newest users when lengths diverge (extra silent
  // OpenCode user rows, missing early displays, etc.).
  const pairCount = Math.min(userIndices.length, snapshots.length);
  const userStart = userIndices.length - pairCount;
  const snapStart = snapshots.length - pairCount;
  const byMessageIndex = new Map<number, ContentBlock[]>();
  for (let p = 0; p < pairCount; p++) {
    const snap = snapshots[snapStart + p];
    if (!snap?.length) continue;
    byMessageIndex.set(userIndices[userStart + p]!, snap);
  }

  return messages.map((m, i) => {
    const snap = byMessageIndex.get(i);
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

/** OpenCode background Task inject prompt — hide from transcript. */
export function isBackgroundTaskInjectUserMessage(msg: ChatStreamMessage): boolean {
  if (msg.type !== "user") return false;
  const blocks = contentBlocks(msg.message?.content);
  if (blocks.length === 0) return false;
  const text = blocks
    .filter((b) => b.type === "text" && b.text?.trim())
    .map((b) => b.text!.trim())
    .join("\n");
  if (!text) return false;
  return isBackgroundTaskInjectMessageText(text);
}

/** Assistant rows that are only inject echo (rare) — also hide. */
export function isBackgroundTaskInjectAssistantMessage(msg: ChatStreamMessage): boolean {
  if (msg.type !== "assistant") return false;
  const blocks = contentBlocks(msg.message?.content);
  if (blocks.length === 0) return false;
  if (blocks.some((b) => b.type !== "text")) return false;
  const text = blocks.map((b) => b.text?.trim() || "").filter(Boolean).join("\n");
  return isBackgroundTaskInjectMessageText(text);
}

export function isHiddenBackgroundTaskInjectMessage(msg: ChatStreamMessage): boolean {
  return isBackgroundTaskInjectUserMessage(msg) || isBackgroundTaskInjectAssistantMessage(msg);
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
  return messages.filter(
    (m) =>
      m.type === "user"
      && !isToolResultUserMessage(m)
      && !isBackgroundTaskInjectUserMessage(m),
  ).length;
}

/** Keep messages through the end of turnIndex (0-based, matches chat-messages turns). */
export function truncateChatMessagesToTurn(
  messages: ChatStreamMessage[],
  turnIndex: number,
): ChatStreamMessage[] {
  let currentTurn = -1;
  const kept: ChatStreamMessage[] = [];
  for (const msg of messages) {
    if (
      msg.type === "user"
      && !isToolResultUserMessage(msg)
      && !isBackgroundTaskInjectUserMessage(msg)
    ) {
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

export function extractTurnUserPreviewFromBlocks(
  allBlocks: ContentBlock[],
): TurnUserPreview {
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

export function extractTurnUserPreview(
  userMessage: ChatStreamMessage | null | undefined,
): TurnUserPreview {
  if (!userMessage) return { text: "", hasAttachments: false };
  return extractTurnUserPreviewFromBlocks(contentBlocks(userMessage.message?.content));
}
