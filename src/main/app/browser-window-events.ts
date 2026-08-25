import { BrowserWindow } from "electron";
import type { HostEventOrigin, HostEvents } from "./event-sink";

/**
 * Default HostEvents: origin-first (experiment run contract), then every live window.
 * Channel strings stay the caller's responsibility — this module does not rename them.
 */
export function createBrowserWindowHostEvents(): HostEvents {
  return {
    broadcast(channel, payload) {
      sendToWindows(channel, payload);
    },
    sendToOriginThenBroadcast(channel, payload, origin) {
      sendToWindows(channel, payload, origin);
    },
  };
}

function sendToWindows(
  channel: string,
  payload: unknown,
  origin?: HostEventOrigin,
): void {
  const sentTo = new WeakSet<object>();
  if (origin) {
    sentTo.add(origin as object);
    try {
      origin.send(channel, payload);
    } catch {
      // Originating window gone; fall through to broadcast.
    }
  }
  if (typeof BrowserWindow?.getAllWindows !== "function") return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const wc = win.webContents;
    if (sentTo.has(wc)) continue;
    sentTo.add(wc);
    try {
      wc.send(channel, payload);
    } catch {
      // Renderer may be reloading.
    }
  }
}
