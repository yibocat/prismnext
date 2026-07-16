/**
 * Push experiment registry changes to all renderer windows so the Experiments
 * mode can refresh without a manual Refresh click, and so Agent `open` can
 * focus a specific island.
 */
import { BrowserWindow } from "electron";

export type ExperimentChangedReason =
  | "create"
  | "append_run"
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

export function broadcastExperimentChanged(event: ExperimentChangedEvent): void {
  const projectRoot = (event.projectRoot || "").replace(/\\/g, "/");
  if (!projectRoot) return;
  const payload: ExperimentChangedEvent = {
    ...event,
    projectRoot,
    id: event.id?.trim() || undefined,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send("experiment:changed", payload);
      }
    } catch {
      // Window may be closing.
    }
  }
}
