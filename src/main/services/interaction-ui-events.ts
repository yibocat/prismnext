/**
 * Push Interaction open/focus events to renderer windows (Agent `interaction-open`).
 */
import { BrowserWindow } from "electron";

export type InteractionChangedReason = "write" | "open" | "thumbnail";

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
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("interaction:changed", payload);
    } catch {
      // Renderer may be reloading.
    }
  }
}
