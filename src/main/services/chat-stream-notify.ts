import { BrowserWindow } from "electron";

/** Push a chat:stream event to all renderer windows (same envelope as EventMapper). */
export function emitChatStream(
  tabId: string,
  type: string,
  data: Record<string, unknown>,
): void {
  const payload = { tabId, type, data };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("chat:stream", payload);
    }
  }
}
