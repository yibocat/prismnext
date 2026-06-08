import { ipcMain } from "electron";
import { getEntries, flushAndClose } from "../services/logger";
import type { LogFetchParams } from "@shared/log-types";

export function registerLogHandlers(): void {
  ipcMain.handle("log:fetch", (_event, params: LogFetchParams) => {
    return getEntries(params);
  });
}

/** Flush pending log entries before app quits. */
export async function disposeLogger() {
  await flushAndClose();
}
