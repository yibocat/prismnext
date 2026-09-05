/**
 * Read-side helpers for Conversation. The reducer writes; this file only views.
 */

import type {
  ContentBlock,
  Conversation,
  ConversationTurn,
  TurnMessageMeta,
} from "../../../shared/agent/conversation";
import { isPlanControlUserText } from "../../../shared/research/plan";
import { sanitizeUserContentBlocksForDisplay } from "@/lib/chat/user-message-display";

function visibleUserBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const sanitized = sanitizeUserContentBlocksForDisplay(blocks);
  const text = sanitized
    .filter((block) => block.type === "text" && block.text?.trim())
    .map((block) => block.text!.trim())
    .join("\n");
  if (isPlanControlUserText(text)) return [];
  return sanitized;
}

export type ConversationDisplayTurn = {
  turnId: string;
  turnIndex: number;
  userBlocks: ContentBlock[];
  assistantBlocks: ContentBlock[];
  status: ConversationTurn["status"] | "streaming";
  error?: string;
  live: boolean;
  meta?: TurnMessageMeta;
};

export function conversationHasContent(
  conv: Conversation | null | undefined,
): boolean {
  if (!conv) return false;
  return conv.turns.length > 0 || conv.live !== null;
}

/**
 * Display turns are rebuilt on every view (once per streamed delta). The
 * reducer never mutates committed turns, so their display projection is
 * cached per turn object — stable identity keeps downstream memos (TurnRail
 * previews, per-turn previews) from recomputing per token.
 */
const displayTurnCache = new WeakMap<ConversationTurn, ConversationDisplayTurn>();

/** Structural source: a committed ConversationTurn or the live streaming turn. */
type DisplayTurnSource = Pick<ConversationTurn, "turnId" | "turnIndex" | "user" | "assistant">
  & { status: ConversationTurn["status"]; error?: string; meta?: TurnMessageMeta };

function buildDisplayTurn(
  turn: DisplayTurnSource,
  raw: ConversationTurn | null,
  live: boolean,
): ConversationDisplayTurn {
  if (raw) {
    const cached = displayTurnCache.get(raw);
    if (cached) return cached;
  }
  const built: ConversationDisplayTurn = {
    turnId: turn.turnId,
    turnIndex: turn.turnIndex,
    userBlocks: visibleUserBlocks(turn.user.blocks),
    assistantBlocks: turn.assistant.blocks,
    status: turn.status,
    ...(turn.error ? { error: turn.error } : {}),
    ...(turn.meta ? { meta: turn.meta } : {}),
    live,
  };
  if (raw) displayTurnCache.set(raw, built);
  return built;
}

export function conversationDisplayTurns(
  conv: Conversation,
): ConversationDisplayTurn[] {
  const turns: ConversationDisplayTurn[] = conv.turns.map(
    (turn) => buildDisplayTurn(turn, turn, false),
  );
  if (conv.live) {
    // The live turn object churns per delta — never cache it.
    turns.push(buildDisplayTurn(conv.live, null, true));
  }
  return turns;
}

/** Chat transcript only: compacted turns stay in the document, but fold above the cut. */
export function conversationVisibleTurns(
  conv: Conversation,
  options?: { expandCompacted?: boolean },
): ConversationDisplayTurn[] {
  const turns = conversationDisplayTurns(conv);
  const cut = conv.compacted?.throughTurnIndex;
  if (!options?.expandCompacted && typeof cut === "number" && cut > 0) {
    return turns.filter((turn) => turn.live || turn.turnIndex >= cut);
  }
  return turns;
}

export function conversationCompactedCount(conv: Conversation | null | undefined): number {
  const cut = conv?.compacted?.throughTurnIndex;
  if (!conv || typeof cut !== "number" || cut <= 0) return 0;
  return conv.turns.filter((turn) => turn.turnIndex < cut).length;
}

export function collectConversationAssistantBlocks(
  conv: Conversation,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const turn of conv.turns) {
    blocks.push(...turn.assistant.blocks);
  }
  if (conv.live) {
    blocks.push(...conv.live.assistant.blocks);
  }
  return blocks;
}

export function findConversationToolUse(
  conv: Conversation | null | undefined,
  toolCallId?: string,
): ContentBlock | undefined {
  if (!conv || !toolCallId) return undefined;
  return collectConversationAssistantBlocks(conv).find(
    (block) => block.type === "tool_use" && block.id === toolCallId,
  );
}

/** Committed user→assistant turns. The live streaming turn is not counted. */
export function countConversationTurns(
  conv: Conversation | null | undefined,
): number {
  return conv?.turns.length ?? 0;
}

export function conversationHasCommittedTurn(
  conv: Conversation | null | undefined,
  turnIndex: number,
): boolean {
  const n = countConversationTurns(conv);
  return turnIndex >= 0 && n > 0 && turnIndex < n;
}

export function snapshotConversation(conv: Conversation): Conversation {
  return structuredClone(conv);
}
