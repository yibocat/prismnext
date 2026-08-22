/**
 * Push Interaction open/focus events to renderer windows (Agent `interaction-open`).
 */
import { getHostEvents } from "../app/event-sink";

export type InteractionChangedReason = "write" | "open";

export interface InteractionChangedEvent {
  projectRoot: string;
  id: string;
  title?: string;
  reason: InteractionChangedReason;
  /** When true, renderer opens Interaction mode and selects this id. */
  focus?: boolean;
}

export function broadcastInteractionChanged(event: InteractionChangedEvent): void {
  const projectRoot = (event.projectRoot || "").replace(/\\/g, "/");
  const id = event.id?.trim();
  if (!projectRoot || !id) return;
  const payload: InteractionChangedEvent = {
    ...event,
    projectRoot,
    id,
    title: event.title?.trim() || undefined,
  };
  getHostEvents().broadcast("interaction:changed", payload);
}
