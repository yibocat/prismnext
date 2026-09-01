import type { ContentBlock, Conversation } from "./conversation";
import { isPlanControlUserText } from "../research/plan";

export const GENERATED_SESSION_TITLE_MAX = 48;

export function isGenericSessionTitle(title: string): boolean {
  if (title === "") return true;
  return title === "New Chat" || title.startsWith("New session");
}

export function sanitizeGeneratedSessionTitle(raw: string): string {
  let title = raw.trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "");
  title = title.replace(/^(title|标题)\s*[:：]\s*/i, "");
  title = title.split(/\r?\n/)[0]?.trim() ?? "";
  title = title.replace(/[.。!！?？;；]+$/g, "").trim();
  if (title.length > GENERATED_SESSION_TITLE_MAX) {
    title = title.slice(0, GENERATED_SESSION_TITLE_MAX).trim();
  }
  return title;
}

export function isProvisionalSessionTitle(title: string, firstUserText?: string): boolean {
  if (isGenericSessionTitle(title)) return true;
  const current = title.trim();
  if (!current) return true;
  // First send writes the compiled agent prompt (file dumps, slash expansions)
  // into the session record — that is not a user-chosen or model-written name.
  if (current.includes("\n") || current.startsWith("## ")) return true;
  const excerpt = firstUserText?.trim();
  if (!excerpt) return false;
  return current === excerpt
    || current === excerpt.slice(0, 40)
    || current === excerpt.slice(0, 80)
    || excerpt.startsWith(current);
}

export function shouldOfferAutoSessionTitle(opts: {
  userTitleSet?: boolean;
  autoTitleAttempted?: boolean;
  completedUserTurns: number;
}): boolean {
  if (opts.userTitleSet || opts.autoTitleAttempted) return false;
  return opts.completedUserTurns === 1;
}

/** First user turn is enough — assistant may be thinking/tools only. */
export function shouldRequestGeneratedSessionTitle(opts: {
  userTitleSet?: boolean;
  autoTitleAttempted?: boolean;
  completedUserTurns: number;
  firstUserExcerpt?: string | null;
}): boolean {
  if (!shouldOfferAutoSessionTitle(opts)) return false;
  return Boolean(opts.firstUserExcerpt?.trim());
}

/**
 * Product conversation id for agent IPC.
 * Never use `tab.sessionId` when it may be a Pi runtime session id.
 */
export function resolveProductConversationId(tab: {
  id: string;
  sessionId?: string | null;
  conversation?: { conversationId?: string } | null;
}): string {
  return tab.conversation?.conversationId?.trim() || tab.id;
}

/** Sidebar must not revert a generated name to the first-send dump. */
export function shouldCopyListedSessionTitle(opts: {
  listedTitle: string;
  tabTitle: string;
  userTitleSet?: boolean;
  autoTitleAttempted?: boolean;
}): boolean {
  if (opts.userTitleSet) return false;
  const listed = opts.listedTitle.trim();
  const tab = opts.tabTitle.trim();
  if (!listed || isGenericSessionTitle(listed)) return false;
  if (tab === listed) return false;
  if (
    opts.autoTitleAttempted
    && !isGenericSessionTitle(tab)
    && listed.length > tab.length + 8
  ) {
    return false;
  }
  return true;
}

export function contentBlocksPlainText(blocks: ContentBlock[] | undefined): string {
  if (!blocks?.length) return "";
  return blocks
    .filter((block) => block.type === "text" && Boolean(block.text?.trim()))
    .map((block) => block.text!.trim())
    .join("\n");
}

function isContentUserText(text: string): boolean {
  return Boolean(text.trim()) && !isPlanControlUserText(text);
}

export function firstCompletedTurnExcerpts(
  conv: Conversation | null | undefined,
): { user: string; assistant: string } | null {
  if (!conv) return null;
  for (const turn of conv.turns) {
    if (turn.status !== "completed") continue;
    const user = contentBlocksPlainText(turn.user.blocks);
    if (!isContentUserText(user)) continue;
    const assistant = contentBlocksPlainText(turn.assistant.blocks);
    return { user: user.slice(0, 1200), assistant: assistant.slice(0, 1200) };
  }
  return null;
}

export function countCompletedContentTurns(conv: Conversation | null | undefined): number {
  if (!conv) return 0;
  return conv.turns.filter((turn) => (
    turn.status === "completed" && isContentUserText(contentBlocksPlainText(turn.user.blocks))
  )).length;
}

export function buildSessionTitlePrompt(userText: string, assistantText: string): string {
  const assistant = assistantText.trim() || "(no assistant reply yet)";
  return [
    "Write a short title for this chat.",
    "Rules: 3–8 words; same language as the user; no quotes; no trailing punctuation; topic only.",
    "",
    "User:",
    userText.trim(),
    "",
    "Assistant:",
    assistant,
    "",
    "Title:",
  ].join("\n");
}
