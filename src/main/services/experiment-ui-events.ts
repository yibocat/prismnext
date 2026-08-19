/**
 * Push experiment registry / run-stream events to all renderer windows so the
 * Experiments mode and Chat widgets stay in sync for both Human UI IPC runs
 * and Agent bridge runs (Station 2).
 */
import { BrowserWindow } from "electron";
import type {
  ExperimentRunCompleteEvent,
  ExperimentRunOutputEvent,
  ExperimentRunStartedEvent,
} from "../../shared/experiment-log";

export type ExperimentChangedReason =
  | "create"
  | "update"
  | "append_run"
  | "run_start"
  | "run_complete"
  | "open"
  | "refresh"
  | "archive"
  | "restore"
  | "delete";

export interface ExperimentChangedEvent {
  projectRoot: string;
  id?: string;
  reason: ExperimentChangedReason;
  /** When true, renderer opens Experiments mode and selects `id`. */
  focus?: boolean;
}

/**
 * Send to an optional originating webContents first, then every other live
 * window. Origin-first preserves the caller contract when the UI invoked
 * `experiment:run`; broadcast covers Cmd-R reload mid-run (Bug #4).
 */
export function sendToExperimentRenderers<T>(
  channel: string,
  payload: T,
  origin?: { send: (channel: string, payload: T) => void },
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

export function broadcastExperimentChanged(event: ExperimentChangedEvent): void {
  const projectRoot = (event.projectRoot || "").replace(/\\/g, "/");
  if (!projectRoot) return;
  const payload: ExperimentChangedEvent = {
    ...event,
    projectRoot,
    id: event.id?.trim() || undefined,
  };
  sendToExperimentRenderers("experiment:changed", payload);
}

export function broadcastExperimentRunStarted(
  event: ExperimentRunStartedEvent,
  origin?: { send: (channel: string, payload: ExperimentRunStartedEvent) => void },
): void {
  sendToExperimentRenderers("experiment:runStarted", event, origin);
}

export function broadcastExperimentRunOutput(
  event: ExperimentRunOutputEvent,
  origin?: { send: (channel: string, payload: ExperimentRunOutputEvent) => void },
): void {
  sendToExperimentRenderers("experiment:runOutput", event, origin);
}

export function broadcastExperimentRunComplete(
  event: ExperimentRunCompleteEvent,
  origin?: { send: (channel: string, payload: ExperimentRunCompleteEvent) => void },
): void {
  sendToExperimentRenderers("experiment:runComplete", event, origin);
}
