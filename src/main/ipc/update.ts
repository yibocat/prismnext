// prism-next/src/main/ipc/update.ts
// IPC surface for the app updater: check / download / install / ignore + About versions.
// Progress is broadcast from update-checker as `update:progress`.

import { app, ipcMain } from "electron";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdaterStatus,
  ignoreVersion,
  quitAndInstall,
  unignoreVersion,
} from "../app/update-checker";

export function registerUpdateHandlers(): void {
  ipcMain.handle("update:check", async () => {
    return checkForUpdates();
  });

  ipcMain.handle("update:status", async () => {
    return getUpdaterStatus();
  });

  ipcMain.handle("update:download", async () => {
    return downloadUpdate();
  });

  ipcMain.handle("update:install", async () => {
    return quitAndInstall();
  });

  ipcMain.handle("update:ignore", async (_event, args: { version: string }) => {
    ignoreVersion(args.version);
    return getUpdaterStatus();
  });

  ipcMain.handle("update:unignore", async () => {
    unignoreVersion();
    return getUpdaterStatus();
  });

  ipcMain.handle("about:getVersions", async () => {
    return { appVersion: app.getVersion() };
  });
}
