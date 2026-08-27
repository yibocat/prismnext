/**
 * chat:send preparation / turn-status stages shown while the UI has no
 * assistant content yet (or when the stream stalls mid-turn).
 * Cleared when the model streams (thought/text/tools) or the turn ends.
 *
 * - describing_images: renderer-only — multimodal helper describing attachments
 * - connecting_remote: renderer-only — SSH / Host bootstrap before agentSend
 * - syncing_project / starting_agent / creating_session / connecting_mcp: setup
 * - starting_model: first turn, waiting for the model to spin up
 * - waiting_model: subsequent turns, prompt dispatched, waiting for output
 * - stalled: turn went silent (no ACP frames) — likely provider retry/backoff
 *
 * UI surfaces each phase with a distinct label so first-send cold start does
 * not look like a silent hang.
 */
export const CHAT_PREPARE_PHASES = [
  "describing_images",
  "connecting_remote",
  "syncing_project",
  "starting_agent",
  "creating_session",
  "connecting_mcp",
  "starting_model",
  "waiting_model",
  "stalled",
] as const;

export type ChatPreparePhase = (typeof CHAT_PREPARE_PHASES)[number];

export function isChatPreparePhase(value: unknown): value is ChatPreparePhase {
  return (
    typeof value === "string"
    && (CHAT_PREPARE_PHASES as readonly string[]).includes(value)
  );
}
