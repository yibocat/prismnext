import { getHostEvents } from "../app/event-sink";

export function broadcastToRenderer(channel: string, payload: Record<string, unknown>): void {
  getHostEvents().broadcast(channel, payload);
}
