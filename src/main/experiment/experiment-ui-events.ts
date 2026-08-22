/**
 * Push experiment registry / run-stream events to all renderer windows so the
 * Experiments mode and Chat widgets stay in sync for both Human UI IPC runs
 * and Agent bridge runs (Station 2).
 */
import { getHostEvents, type HostEventOrigin } from "../app/event-sink";
import type {
  ExperimentRunCompleteEvent,
  ExperimentRunOutputEvent,
  ExperimentRunStartedEvent,
} from "../../shared/experiments/log";

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
  getHostEvents().sendToOriginThenBroadcast(
    channel,
    payload,
    origin as HostEventOrigin | undefined,
  );
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
