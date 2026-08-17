/**
 * Read-side helpers for Conversation. The reducer writes; this file only views.
 */

import type {
  ContentBlock,
  Conversation,
  ConversationTurn,
  TurnMessageMeta,
} from "../../../shared/agent-conversation";

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

export function conversationDisplayTurns(
  conv: Conversation,
): ConversationDisplayTurn[] {
  const turns: ConversationDisplayTurn[] = conv.turns.map((turn) => ({
    turnId: turn.turnId,
    turnIndex: turn.turnIndex,
    userBlocks: turn.user.blocks,
    assistantBlocks: turn.assistant.blocks,
    status: turn.status,
    ...(turn.error ? { error: turn.error } : {}),
    ...(turn.meta ? { meta: turn.meta } : {}),
    live: false,
  }));
  if (conv.live) {
    turns.push({
      turnId: conv.live.turnId,
      turnIndex: conv.live.turnIndex,
      userBlocks: conv.live.user.blocks,
      assistantBlocks: conv.live.assistant.blocks,
      status: "streaming",
      live: true,
    });
  }
  return turns;
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
