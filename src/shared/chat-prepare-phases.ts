/**
 * First-turn chat:send preparation stages shown while the UI has no assistant content yet.
 * Cleared when the model starts streaming (thought/text/tools) or the turn ends.
 */
export const CHAT_PREPARE_PHASES = [
  "syncing_project",
  "creating_session",
  "connecting_mcp",
  "starting_model",
] as const;

export type ChatPreparePhase = (typeof CHAT_PREPARE_PHASES)[number];

export function isChatPreparePhase(value: unknown): value is ChatPreparePhase {
  return (
    typeof value === "string"
    && (CHAT_PREPARE_PHASES as readonly string[]).includes(value)
  );
}
