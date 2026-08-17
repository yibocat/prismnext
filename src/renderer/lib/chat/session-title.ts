import { partsToPlainText } from "./composer-parts";
import { isToolResultUserMessage } from "@/components/modules/chat/chat-turns";
import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";

export function isGenericSessionTitle(title: string): boolean {
  if (title === "") return true;
  return title === "New Chat" || title.startsWith("New session");
}

/** Strip agent/system wrappers from raw prompt text before using as title. */
export function cleanSessionTitleText(text: string): string {
  let cleaned = text
    .replace(/<[^>]+>/g, "")
    .replace(/^\[Currently open file:.*?\]\n?\n?/, "")
    .trim();

  if (cleaned.includes("## Referenced files") || cleaned.includes("## Command instructions")) {
    const parts = cleaned.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part.startsWith("## ") || part.startsWith("```")) continue;
      return part.replace(/^User request:\s*/i, "").trim();
    }
    return "";
  }

  return cleaned;
}

export function extractTitleFromContentBlocks(blocks: ContentBlock[]): string | null {
  for (const block of blocks) {
    if (block.type !== "text") continue;
    if (block.inlineParts?.length) {
      const plain = partsToPlainText(block.inlineParts).trim();
      if (plain) return plain.slice(0, 40);
    }
    if (block.text?.trim()) {
      const cleaned = cleanSessionTitleText(block.text);
      if (cleaned) return cleaned.slice(0, 40);
    }
  }
  return null;
}

/** Extract session title from the first visible user message. */
export function extractSessionTitle(messages: ChatStreamMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type !== "user" || isToolResultUserMessage(msg)) continue;
    const content = msg.message?.content;
    if (!content) continue;

    if (typeof content === "string") {
      const cleaned = cleanSessionTitleText(content);
      if (cleaned) return cleaned.slice(0, 40);
      continue;
    }

    if (Array.isArray(content) && content.length > 0) {
      const fromBlocks = extractTitleFromContentBlocks(content);
      if (fromBlocks) return fromBlocks;
    }
  }
  return null;
}

/** Title for top bar / sidebar — prefers stored title, falls back to message content. */
export function resolveSessionTitle(tab: {
  title: string;
  messages: ChatStreamMessage[];
}): string | null {
  if (!isGenericSessionTitle(tab.title)) {
    return tab.title;
  }
  const fromMessages = extractSessionTitle(tab.messages);
  if (fromMessages) return fromMessages;
  if (tab.messages.length === 0) return null;
  return null;
}

/** Derive title when sending or appending the first user turn. */
export function deriveSessionTitleForSend(
  tab: { title: string; messages: ChatStreamMessage[] },
  userPrompt: string,
  userContent?: ContentBlock[],
  userMessage?: ChatStreamMessage | null,
): string {
  if (!isGenericSessionTitle(tab.title)) return tab.title;

  if (userContent?.length) {
    const fromBlocks = extractTitleFromContentBlocks(userContent);
    if (fromBlocks) return fromBlocks;
  }
  if (userMessage) {
    const fromMsg = extractSessionTitle([userMessage]);
    if (fromMsg) return fromMsg;
  }
  const fromTab = extractSessionTitle(tab.messages);
  if (fromTab) return fromTab;

  const cleaned = cleanSessionTitleText(userPrompt);
  if (cleaned) return cleaned.slice(0, 40);
  return tab.title;
}

/**
 * Blank "New Chat" tab with no session, messages, or draft — safe to drop when
 * the user opens a history session instead of sending on this tab.
 */
export function isDisposableEmptyChatTab(tab: {
  sessionId: string | null;
  isStreaming: boolean;
  isLoadingSession?: boolean;
  messages: unknown[];
  streamingMessage: unknown;
  conversation?: { turns: unknown[]; live: unknown };
  draft?: { input?: string; parts?: unknown[] };
}): boolean {
  if (tab.sessionId || tab.isStreaming || tab.isLoadingSession) return false;
  if (tab.conversation && (tab.conversation.turns.length > 0 || tab.conversation.live)) return false;
  if (tab.messages.length > 0 || tab.streamingMessage) return false;
  if ((tab.draft?.input ?? "").trim()) return false;
  if (tab.draft?.parts && tab.draft.parts.length > 0) return false;
  return true;
}

/** Drop disposable empty tabs, optionally keeping one id (e.g. the session being opened). */
export function pruneDisposableEmptyChatTabs<T extends {
  id: string;
  sessionId: string | null;
  isStreaming: boolean;
  isLoadingSession?: boolean;
  messages: unknown[];
  streamingMessage: unknown;
  draft?: { input?: string; parts?: unknown[] };
}>(tabs: T[], keepId?: string): T[] {
  return tabs.filter((t) => t.id === keepId || !isDisposableEmptyChatTab(t));
}
