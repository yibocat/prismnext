// src/main/ipc/theme.ts
// IPC handler for theme → native vibrancy synchronization + system fonts.

import { ipcMain, BrowserWindow } from "electron";
import { setVibrancyForTheme, type VibrancyMode } from "../services/glass-vibrancy";
import { listSystemFonts } from "../services/system-fonts";

export function registerThemeHandlers(): void {
  ipcMain.handle(
    "theme:setGlassMode",
    (_event, mode: VibrancyMode) => {
      const win = BrowserWindow.fromWebContents(_event.sender);
      if (win) {
        setVibrancyForTheme(win, mode);
      }
    },
  );

  ipcMain.handle("theme:listSystemFonts", async () => listSystemFonts());
}
