// prism-next/src/main/ipc/update.ts
// IPC surface for the app updater. Task 5: check/ignore remain; Task 6 adds
// download / install / progress. About still uses openExternal via `latest.path`
// until downloadUpdate is wired in the UI.
// About also reads app + bundled OpenCode versions here (same settings panel).

import { ipcMain } from "electron";
import {
  checkForUpdates,
  getCachedStatus,
  ignoreVersion,
  toLegacyResult,
  unignoreVersion,
} from "../services/update-checker";
import { getAboutVersions } from "../services/opencode-binary";

export function registerUpdateHandlers(): void {
  ipcMain.handle("update:check", async () => {
    // Return legacy shape so current About / welcome UI keep working.
    // Task 6 should switch to UpdaterStatus + download/install channels.
    return toLegacyResult(await checkForUpdates());
  });

  ipcMain.handle("update:status", async () => {
    return getCachedStatus();
  });

  ipcMain.handle("update:ignore", async (_event, args: { version: string }) => {
    ignoreVersion(args.version);
    return getCachedStatus();
  });

  ipcMain.handle("update:unignore", async () => {
    unignoreVersion();
    return getCachedStatus();
  });

  ipcMain.handle("about:getVersions", async () => {
    return getAboutVersions();
  });
}
