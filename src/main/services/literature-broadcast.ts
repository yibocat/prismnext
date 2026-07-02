import { BrowserWindow } from "electron";

export function broadcastToRenderer(channel: string, payload: Record<string, unknown>): void {
  if (typeof BrowserWindow?.getAllWindows !== "function") return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}
