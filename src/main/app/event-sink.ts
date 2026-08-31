/**
 * Host event port — domain code broadcasts through this, not BrowserWindow.
 * The default implementation lives in `browser-window-events.ts`.
 */
import { createBrowserWindowHostEvents } from "./browser-window-events";

export type HostEventOrigin = {
  send(channel: string, payload: unknown): void;
};

export type HostEvents = {
  broadcast(channel: string, payload: unknown): void;
  sendToOriginThenBroadcast(
    channel: string,
    payload: unknown,
    origin?: HostEventOrigin,
  ): void;
};

let override: HostEvents | null = null;
let defaultImpl: HostEvents | null = null;

export function getHostEvents(): HostEvents {
  if (override) return override;
  if (!defaultImpl) defaultImpl = createBrowserWindowHostEvents();
  return defaultImpl;
}

export function setHostEvents(sink: HostEvents | null): void {
  override = sink;
}

export function setHostEventsForTest(sink: HostEvents | null): void {
  setHostEvents(sink);
}
