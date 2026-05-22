import { ipcMain } from "electron";
import { getSettings, updateSettings } from "../services/settings";

export function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });

  ipcMain.handle(
    "settings:set",
    async (_event, patch: Record<string, unknown>) => {
      updateSettings(patch as Parameters<typeof updateSettings>[0]);
    },
  );
}
