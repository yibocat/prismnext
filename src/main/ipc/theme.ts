// Theme IPC — native glass apply + system fonts.

import { ipcMain, BrowserWindow } from "electron";
import {
  applyNativeGlass,
  type ApplyGlassPayload,
} from "../app/glass-vibrancy";
import { listSystemFonts } from "../app/system-fonts";

export function registerThemeHandlers(): void {
  ipcMain.handle(
    "theme:applyGlass",
    (_event, payload: ApplyGlassPayload) => {
      const win = BrowserWindow.fromWebContents(_event.sender);
      if (!win || !payload || typeof payload.enabled !== "boolean") return;
      applyNativeGlass(win, payload);
    },
  );

  ipcMain.handle("theme:listSystemFonts", async () => listSystemFonts());
}
