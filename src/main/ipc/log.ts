import { ipcMain } from "electron";
import { createLogger, getEntries, flushAndCloseSync, shortLogDetail } from "../app/logger";
import type { LogFetchParams } from "@shared/platform/log-types";

const log = createLogger("ipc-guard", "ipc");

/** Fetching logs must not log — a failure here would recurse into the ring. */
const IPC_HANDLER_ERROR_SKIP = new Set(["log:fetch"]);

type IpcHandle = typeof ipcMain.handle;

/**
 * Log unexpected handler throws. Business replies such as `{ ok: false }`
 * are return values and must not be treated as errors.
 */
export function installIpcHandlerErrorGuard(
  ipc: Pick<Electron.IpcMain, "handle"> = ipcMain,
): void {
  const originalHandle = ipc.handle.bind(ipc) as IpcHandle;
  ipc.handle = ((channel: string, listener: (...args: unknown[]) => unknown) => {
    if (IPC_HANDLER_ERROR_SKIP.has(channel)) {
      return originalHandle(channel, listener as never);
    }
    return originalHandle(channel, (async (...args: unknown[]) => {
      try {
        return await listener(...args);
      } catch (err) {
        log.error("ipc.handler.error", {
          channel,
          error: shortLogDetail(err),
        });
        throw err;
      }
    }) as never);
  }) as IpcHandle;
}

export function registerLogHandlers(): void {
  ipcMain.handle("log:fetch", (_event, params: LogFetchParams) => {
    return getEntries(params);
  });
}

/** Flush pending log entries before app quits. Sync so the last lines survive exit. */
export function disposeLogger() {
  flushAndCloseSync();
}
